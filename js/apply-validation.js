// apply-validation.js
// Validation methods for the RentalApplication class.
// Loaded before apply.js. Applied via Object.assign(RentalApplication.prototype, ...) at end of apply.js.
//
// Methods provided:
//   setupRealTimeValidation() — attaches input/change/blur listeners to all form fields
//   validateField(field)      — validates a single input; returns boolean
//   showError(field, message) — marks a field as invalid and shows the error message
//   clearError(field)         — clears error state from a field
//   validateStep(stepNumber)  — validates all required fields in a step; returns boolean
//   validatePaymentSelections() — validates payment icon grid selection; returns boolean
//   scrollToInvalidField(field) — scrolls to and highlights the first invalid field

/* global window */
window.APPLY_VALIDATION = {

    // ---------- Real-time validation ----------
    setupRealTimeValidation() {
        const form = document.getElementById('rentalApplication');
        if (!form) return;
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.validateField(input));
            input.addEventListener('change', () => this.validateField(input));
            input.addEventListener('blur', () => this.validateField(input));
        });
    },

    // ---------- Validation logic ----------
    validateField(field) {
        let isValid = true;
        let errorMessage = this.t('errRequired');
        if (field.id === 'ssn' || field.id === 'coSsn') {
            const ssnVal = field.value.replace(/\D/g, '');
            if (!ssnVal) {
                isValid = false;
                errorMessage = this.t('errSSNRequired');
            } else if (ssnVal.length < 4) {
                isValid = false;
                errorMessage = this.t('errSSNLength');
            } else if (/[^0-9]/.test(field.value)) {
                isValid = false;
                errorMessage = this.t('errSSNNumbers');
            }
        } else if (field.id === 'dob' || field.id === 'coDob') {
            // Parse as local midnight to avoid UTC offset errors in US timezones
            const [by, bm, bd] = (field.value || '').split('-').map(Number);
            const birthDate = field.value ? new Date(by, bm - 1, bd) : null;
            const today = new Date();
            if (!field.value) {
                isValid = false;
                errorMessage = this.t('errDOBRequired');
            } else if (isNaN(birthDate.getTime())) {
                isValid = false;
                errorMessage = this.t('errDOBInvalid');
            } else {
                let age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
                if (age < 18) {
                    isValid = false;
                    errorMessage = this.t('errDOBAge');
                }
            }
        } else if (field.id === 'requestedMoveIn') {
            // Parse as local midnight to avoid UTC offset errors in US timezones
            const [miy, mim, mid] = (field.value || '').split('-').map(Number);
            const moveInDate = field.value ? new Date(miy, mim - 1, mid) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const minDate = new Date(today);
            minDate.setDate(minDate.getDate() + 3); // 3-day minimum buffer
            if (!field.value) {
                isValid = false;
                errorMessage = this.t('errMoveInRequired');
            } else if (moveInDate < today) {
                isValid = false;
                errorMessage = this.t('errMoveInPast');
            } else if (moveInDate < minDate) {
                isValid = false;
                errorMessage = this.t('errMoveInTooSoon');
            }
        } else if (field.hasAttribute('required')) {
            if (field.type === 'checkbox') {
                isValid = field.checked;
            } else if (!field.value.trim()) {
                isValid = false;
            }
            if (!isValid) {
                errorMessage = this.t('errRequired');
            }
        }
        if (isValid && field.value.trim()) {
            if (field.type === 'email') {
                const email = field.value.trim();
                if (!email.includes('@')) {
                    isValid = false;
                    errorMessage = this.t('errEmailSymbol');
                } else {
                    const parts = email.split('@');
                    if (!parts[1] || !parts[1].includes('.')) {
                        isValid = false;
                        errorMessage = this.t('errEmailDomain');
                    } else {
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        isValid = emailRegex.test(email);
                        if (!isValid) {
                            errorMessage = this.t('errEmailFormat');
                        }
                    }
                }
            } else if (field.type === 'tel') {
                const phoneDigits = field.value.replace(/\D/g, '');
                isValid = phoneDigits.length === 10;
                if (!isValid) {
                    errorMessage = this.t('errPhoneInvalid');
                } else {
                    // Check for valid US phone format: (XXX) XXX-XXXX or XXX-XXX-XXXX or XXX XXX XXXX
                    const phoneRegex = /^(\(\d{3}\)\s?|\d{3}-?)\d{3}-?\d{4}$/;
                    isValid = phoneRegex.test(field.value.replace(/\s/g, ''));
                    if (!isValid) {
                        errorMessage = 'Please enter a valid US phone number format (e.g., (123) 456-7890)';
                    }
                }
            }
        }
        if (isValid) {
            this.clearError(field);
            field.classList.add('is-valid');
            field.classList.remove('is-invalid');
        } else {
            this.showError(field, errorMessage);
            field.classList.add('is-invalid');
            field.classList.remove('is-valid');
            field.classList.add('shake');
            setTimeout(() => field.classList.remove('shake'), 400);
        }
        return isValid;
    },

    showError(field, message) {
        field.classList.add('error');
        field.setAttribute('aria-invalid', 'true');
        const errorMsg = field.closest('.form-group')?.querySelector('.error-message');
        if (errorMsg) {
            errorMsg.textContent = message;
            errorMsg.style.display = 'block';
        }
    },

    clearError(field) {
        field.classList.remove('error');
        field.setAttribute('aria-invalid', 'false');
        const errorMsg = field.closest('.form-group')?.querySelector('.error-message');
        if (errorMsg) {
            errorMsg.style.display = 'none';
        }
    },

    // ---------- Step validation ----------
    validateStep(stepNumber) {
        // Step 1: enforce property selection (Option B — must select from dropdown)
        if (stepNumber === 1) {
            const lockedCard = document.getElementById('propertyLockedCard');
            const isLocked   = lockedCard && lockedCard.style.display !== 'none';
            const select = document.getElementById('propertySelect');
            const errEl  = document.getElementById('propertySelectError');
            // Only validate the dropdown when it is visible (not when the locked card is showing)
            if (!isLocked) {
                if (select && !select.value) {
                    if (errEl) errEl.style.display = 'block';
                    select.style.borderColor = '#dc2626';
                    select.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return false;
                } else if (select) {
                    if (errEl) errEl.style.display = 'none';
                    select.style.borderColor = '';
                }
            } else if (select) {
                // Locked mode — clear any previous error state on the hidden select
                if (errEl) errEl.style.display = 'none';
                select.style.borderColor = '';
            }
        }
        if (stepNumber === 6) {
            // Payment: require a primary method selected via icon grid
            const isUnique = this.validatePaymentSelections();
            if (!isUnique) {
                const grid = document.getElementById('paymentIconGrid');
                if (grid) { grid.classList.add('shake'); setTimeout(() => grid.classList.remove('shake'), 400); }
                grid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return false;
            }

            // Enforce at least one contact method
            const methodBoxes = document.querySelectorAll('input[name="Preferred Contact Method"]');
            const anyChecked = Array.from(methodBoxes).some(cb => cb.checked);
            let contactErrEl = document.getElementById('contactMethodError');
            if (!contactErrEl && methodBoxes.length > 0) {
                contactErrEl = document.createElement('div');
                contactErrEl.id = 'contactMethodError';
                contactErrEl.className = 'error-message';
                contactErrEl.style.display = 'none';
                contactErrEl.textContent = this.t('errContactMethod') || 'Please select at least one contact method.';
                methodBoxes[methodBoxes.length - 1].closest('.checkbox-group')?.after(contactErrEl);
            }
            if (!anyChecked) {
                if (contactErrEl) contactErrEl.style.display = 'block';
                methodBoxes[0]?.closest('.form-group')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return false;
            } else {
                if (contactErrEl) contactErrEl.style.display = 'none';
            }
        }
        const section = document.getElementById(`section${stepNumber}`);
        if (!section) return true;
        const inputs = section.querySelectorAll('input, select, textarea');
        let isStepValid = true;
        let firstInvalidField = null;
        inputs.forEach(input => {
            if (input.hasAttribute('required')) {
                if (!this.validateField(input)) {
                    isStepValid = false;
                    if (!firstInvalidField) firstInvalidField = input;
                }
            }
        });
        if (stepNumber === 6) {
            // Co-applicant validation (moved from old step 4)
            const hasCoApplicant = document.getElementById('hasCoApplicant');
            const coSection = document.getElementById('coApplicantSection');
            if (hasCoApplicant && hasCoApplicant.checked && coSection && coSection.style.display !== 'none') {
                const coInputs = coSection.querySelectorAll('input, select, textarea');
                coInputs.forEach(input => {
                    if (input.type === 'radio') {
                        const name = input.name;
                        const radios = coSection.querySelectorAll(`input[name="${name}"]`);
                        const checked = Array.from(radios).some(r => r.checked);
                        if (!checked) {
                            this.showError(radios[0], this.t('errRoleRequired'));
                            radios[0].classList.add('is-invalid');
                            isStepValid = false;
                            if (!firstInvalidField) firstInvalidField = radios[0];
                        } else {
                            radios.forEach(r => this.clearError(r));
                        }
                    } else if (input.type === 'checkbox') {
                        if (input.id === 'coConsent' && !input.checked) {
                            this.showError(input, this.t('errVerifyRequired'));
                            input.classList.add('is-invalid');
                            isStepValid = false;
                            if (!firstInvalidField) firstInvalidField = input;
                        } else {
                            this.clearError(input);
                        }
                    } else {
                        if (!input.value.trim()) {
                            this.showError(input, this.t('errRequired'));
                            input.classList.add('is-invalid');
                            isStepValid = false;
                            if (!firstInvalidField) firstInvalidField = input;
                        } else {
                            if (!this.validateField(input)) {
                                isStepValid = false;
                                if (!firstInvalidField) firstInvalidField = input;
                            }
                        }
                    }
                });
            }
        }
        if (!isStepValid && firstInvalidField) this.scrollToInvalidField(firstInvalidField);
        return isStepValid;
    },

    validatePaymentSelections() {
        const primaryInput = document.getElementById('primaryPayment');
        const primaryVal   = primaryInput ? primaryInput.value : '';
        const errEl        = document.getElementById('primaryPaymentError');
        const validMethods = ['Cash', 'Check', 'Money Order', 'ACH/eCheck', 'Zelle', 'Venmo', 'PayPal', 'Other'];
        if (!primaryVal) {
            if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Please select a payment method.'; }
            return false;
        }
        if (!validMethods.includes(primaryVal)) {
            if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Please select a valid payment method.'; }
            return false;
        }
        if (errEl) errEl.style.display = 'none';
        return true;
    },

    scrollToInvalidField(field) {
        const scrollTarget = field.closest('.form-group') || field;
        scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field.classList.add('shake', 'highlight-field');
        setTimeout(() => field.focus(), 600);
        setTimeout(() => field.classList.remove('shake', 'highlight-field'), 2000);
    },

    // ---------- Character counter for textareas ----------
    setupCharacterCounters() {
        const form = document.getElementById('rentalApplication');
        if (!form) return;
        const textareas = form.querySelectorAll('textarea[maxlength]');
        textareas.forEach(textarea => {
            const maxLength = parseInt(textarea.getAttribute('maxlength'), 10);
            if (!maxLength || maxLength <= 0) return;

            // Find or create character counter element
            let counter = textarea.closest('.form-group')?.querySelector('.char-count');
            if (!counter) {
                counter = document.createElement('div');
                counter.className = 'char-count';
                textarea.parentNode.insertBefore(counter, textarea.nextSibling);
            }

            // Update counter on input
            const updateCounter = () => {
                const current = textarea.value.length;
                const remaining = maxLength - current;
                counter.textContent = `${current}/${maxLength} characters`;
                
                // Apply warning/exceeded classes
                counter.classList.remove('warning', 'exceeded');
                if (remaining < 0) counter.classList.add('exceeded');
                else if (remaining < maxLength * 0.2) counter.classList.add('warning');
                
                // Prevent exceeded input
                if (current > maxLength) {
                    textarea.value = textarea.value.substring(0, maxLength);
                    counter.textContent = `${maxLength}/${maxLength} characters`;
                    counter.classList.add('exceeded');
                }
            };

            textarea.addEventListener('input', updateCounter);
            textarea.addEventListener('change', updateCounter);
            updateCounter(); // Initialize
        });
    },

};
