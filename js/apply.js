class RentalApplication {
    constructor() {
        // Scope draft key to propertyId — prevents drafts from bleeding across different listings.
        const _pid = new URLSearchParams(window.location.search).get('propertyId') || 'generic';
        this.config = {
            LOCAL_STORAGE_KEY: `choicePropertiesRentalApp_${_pid}`,
            AUTO_SAVE_INTERVAL: 30000,
            MAX_FILE_SIZE: 10 * 1024 * 1024
        };
        
        this.state = {
            currentSection: 1,
            isSubmitting: false,
            isOnline: true,
            lastSave: null,
            applicationId: null,
            formData: {},
            language: 'en'
        };
        
        // Smart retry properties
        this.maxRetries = 3;
        this.retryCount = 0;
        this.retryTimeout = null;

        // P1-D: Tracks whether the form has changes not yet persisted to localStorage
        this._hasUnsavedChanges = false;

        // Single source of truth for which property is currently selected.
        // Set by onPropertySelected(); read by validateStep(1) and submission.
        this._selectedPropertyId = null;
        
        // config.js must be loaded before this file
        this.BACKEND_URL = CONFIG.SUPABASE_URL + '/functions/v1/process-application';
        
        this.initialize();
    }

    // ---------- Pre-fill from URL params (when linked from a property listing) ----------
    prefillFromURL() {
        const p = new URLSearchParams(window.location.search);
        // Pre-fill move-in date if passed from listing page
        const moveIn = p.get('moveIn');
        const moveInEl = document.getElementById('requestedMoveIn');
        if (moveIn && moveInEl && !moveInEl.value) moveInEl.value = moveIn;
        // Property selection is handled by loadLockedProperty() using the propertyId param
    }

    // ---------- SSN toggle ----------
    setupSSNToggle() {
        const ssnInput = document.getElementById('ssn');
        if (!ssnInput) return;
        const container = ssnInput.parentElement;
        let toggle = container.querySelector('.ssn-toggle');
        if (!toggle) {
            toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'ssn-toggle';
            toggle.id = 'ssnToggle';
            toggle.innerHTML = '<i class="fas fa-eye"></i>';
            container.appendChild(toggle);
        }
        ssnInput.type = 'password';
        toggle.addEventListener('click', () => {
            if (ssnInput.type === 'password') {
                ssnInput.type = 'text';
                toggle.innerHTML = '<i class="fas fa-eye-slash"></i>';
            } else {
                ssnInput.type = 'password';
                toggle.innerHTML = '<i class="fas fa-eye"></i>';
            }
        });
        ssnInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').substring(0, 4);
        });
    }

    // ---------- Co-applicant SSN toggle ----------
    setupCoSSNToggle() {
        const coSsnInput = document.getElementById('coSsn');
        if (!coSsnInput) return;
        const container = coSsnInput.parentElement;
        if (container.querySelector('.ssn-toggle')) return; // already exists
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'ssn-toggle';
        toggle.innerHTML = '<i class="fas fa-eye"></i>';
        container.appendChild(toggle);
        coSsnInput.type = 'password';
        toggle.addEventListener('click', () => {
            if (coSsnInput.type === 'password') {
                coSsnInput.type = 'text';
                toggle.innerHTML = '<i class="fas fa-eye-slash"></i>';
            } else {
                coSsnInput.type = 'password';
                toggle.innerHTML = '<i class="fas fa-eye"></i>';
            }
        });
        coSsnInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').substring(0, 4);
        });
    }

    // ---------- Employment status conditionals ----------
    setupEmploymentConditionals() {
        const statusEl = document.getElementById('employmentStatus');
        if (!statusEl) return;
        statusEl.addEventListener('change', (e) => this._applyEmploymentLabels(e.target.value));
        // Apply on load in case of restored draft
        if (statusEl.value) this._applyEmploymentLabels(statusEl.value);
    }

    // Shared helper — called by both setupEmploymentConditionals and applyTranslations
    _applyEmploymentLabels(status) {
        const EMPLOYED_STATUSES = ['Full-time', 'Part-time', 'Self-employed'];
        const isEmployed = EMPLOYED_STATUSES.includes(status);

        const employedGroup = document.getElementById('employedFieldsGroup');
        const altGroup      = document.getElementById('altIncomeSourceGroup');
        const employerInput = document.getElementById('employer');
        const employerLbl   = document.getElementById('employerLabel');
        const incomeLabel   = document.querySelector('label[for="monthlyIncome"]');

        // Toggle employed-only fields
        if (employedGroup) {
            employedGroup.style.display = isEmployed ? '' : 'none';
            employedGroup.querySelectorAll('input, select').forEach(el => {
                if (isEmployed) {
                    el.setAttribute('required', '');
                } else {
                    el.removeAttribute('required');
                    this.clearError(el);
                    el.classList.remove('is-invalid', 'is-valid');
                }
            });
        }

        // Employer field label and required
        if (employerInput && employerLbl) {
            const labelKey = isEmployed ? 'employerLabel' : `employerLabel_${status}`;
            const labelText = this.t(labelKey);
            employerLbl.childNodes[0].textContent = labelText + ' ';
            if (isEmployed) {
                employerInput.setAttribute('required', '');
                employerInput.placeholder = '';
            } else {
                employerInput.removeAttribute('required');
                employerInput.placeholder = this.t('errRequired') === 'Obligatorio' ? 'Opcional' : 'Optional';
                this.clearError(employerInput);
                employerInput.classList.remove('is-invalid');
            }
        }

        // Alt income source group for non-employed
        if (altGroup) {
            altGroup.style.display = isEmployed ? 'none' : '';
            // Update its label and placeholder in current language
            const lbl = altGroup.querySelector('label');
            if (lbl) lbl.childNodes[0].textContent = this.t('altIncomeSourceLabel') + ' ';
            const inp = altGroup.querySelector('input');
            if (inp) inp.placeholder = this.t('altIncomeSourcePlaceholder');
        }

        // Income label relabel by status
        if (incomeLabel) {
            const labelKey = `incomeLabel_${status}`;
            const labelText = this.t(labelKey);
            // Only update if we got a real translated variant (not the key itself as fallback)
            if (labelText !== labelKey) {
                incomeLabel.childNodes[0].textContent = labelText + ' ';
            } else {
                incomeLabel.childNodes[0].textContent = this.t('monthlyIncomeLabel') + ' ';
            }
        }
    }

    // ---------- Prior residence conditional (2.1) ----------
    // Show the prior residence section when "How long at this address?" suggests < 2 years.
    setupPriorResidenceConditional() {
        const input = document.getElementById('residencyStart');
        const group = document.getElementById('priorResidenceGroup');
        if (!input || !group) return;
        const check = () => {
            group.style.display = this._isUnderTwoYears(input.value) ? '' : 'none';
        };
        input.addEventListener('input', check);
        input.addEventListener('change', check);
        check(); // Apply on load (restored draft)
    }

    _isUnderTwoYears(text) {
        const t = (text || '').toLowerCase().trim();
        if (!t) return false;
        // Month-only pattern: "6 months", "18 months" (no year)
        const moOnly = t.match(/^(\d+)\s*month/);
        if (moOnly) return parseInt(moOnly[1]) < 24;
        // Year pattern: "1 year", "1.5 years"
        const yrMatch = t.match(/(\d+\.?\d*)\s*year/);
        if (yrMatch) return parseFloat(yrMatch[1]) < 2;
        // Common phrase cues
        if (/less than|under 2|just moved|recently moved|new(ly)?/.test(t)) return true;
        return false;
    }

    // ---------- Co-applicant employment status conditional (2.8) ----------
    setupCoEmploymentConditionals() {
        const statusEl = document.getElementById('coEmploymentStatus');
        if (!statusEl) return;
        const EMPLOYED = ['Full-time', 'Part-time', 'Self-employed'];
        const toggle = (val) => {
            const group = document.getElementById('coEmployedFieldsGroup');
            if (!group) return;
            group.style.display = EMPLOYED.includes(val) ? '' : 'none';
        };
        statusEl.addEventListener('change', e => toggle(e.target.value));
        toggle(statusEl.value); // Apply on load
    }

    // ---------- Eviction / Bankruptcy / Criminal explain boxes ----------
    setupEvictionExplain() {
        const makeToggle = (radioName, groupId) => {
            const radios = document.querySelectorAll(`input[name="${radioName}"]`);
            const group  = document.getElementById(groupId);
            if (!group) return;
            radios.forEach(r => r.addEventListener('change', (e) => {
                group.style.display = e.target.value === 'Yes' ? '' : 'none';
            }));
        };
        makeToggle('Ever Evicted',       'evictionExplainGroup');
        makeToggle('Has Bankruptcy',     'bankruptcyExplainGroup');
        makeToggle('Has Criminal History', 'criminalExplainGroup');
    }

    // ---------- Phone auto-formatting ----------
    setupPhoneFormatting() {
        const phoneFields = document.querySelectorAll('input[type="tel"]');
        phoneFields.forEach(input => {
            input.addEventListener('input', (e) => {
                const digits = e.target.value.replace(/\D/g, '').substring(0, 10);
                let formatted = digits;
                if (digits.length >= 7) {
                    formatted = `(${digits.substring(0,3)}) ${digits.substring(3,6)}-${digits.substring(6)}`;
                } else if (digits.length >= 4) {
                    formatted = `(${digits.substring(0,3)}) ${digits.substring(3)}`;
                } else if (digits.length > 0) {
                    formatted = `(${digits}`;
                }
                e.target.value = formatted;
            });
        });
    }

    // ---------- Income currency formatting ----------
    setupIncomeFormatting() {
        const incomeFields = ['monthlyIncome', 'otherIncome', 'coMonthlyIncome', 'rentAmount'];
        incomeFields.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('blur', (e) => {
                const raw = e.target.value.replace(/[^0-9.]/g, '');
                if (!raw) return;
                const num = parseFloat(raw);
                if (!isNaN(num)) {
                    e.target.value = '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                }
            });
            el.addEventListener('focus', (e) => {
                e.target.value = e.target.value.replace(/[^0-9.]/g, '');
            });
        });
    }

    // ---------- Test fill visibility — localhost only ----------
    setupTestFillVisibility() {
        const container = document.getElementById('testButtonContainer');
        if (container && CONFIG.isLocalhost) {
            container.style.display = 'block';
        }
    }

    // ---------- Event listeners ----------
    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('.btn-next') || e.target.closest('.btn-next')) {
                const section = this.getCurrentSection();
                this.nextSection(section);
            }
            if (e.target.matches('.btn-prev') || e.target.closest('.btn-prev')) {
                const section = this.getCurrentSection();
                this.previousSection(section);
            }
        });
        // P1-D: Track unsaved changes flag and auto-save
        document.addEventListener('input', (e) => {
            // Don't flag SSN fields as "unsaved changes" to avoid privacy-related prompts
            if (e.target && (e.target.id === 'ssn' || e.target.id === 'coSsn')) return;
            this._hasUnsavedChanges = true;
            this.debouncedSave();
        });
        // P1-D: beforeunload warning when unsaved changes exist
        window.addEventListener('beforeunload', (e) => {
            if (this._hasUnsavedChanges && !this.state.isSubmitting) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
        const form = document.getElementById('rentalApplication');
        if (form) {
            form.addEventListener('submit', (e) => {
                this.handleFormSubmit(e);
            });
        }
    }

    // P1-D: debounced save helper (created once, reused)
    get debouncedSave() {
        if (!this._debouncedSave) {
            this._debouncedSave = this.debounce(() => this.saveProgress(), 1000);
        }
        return this._debouncedSave;
    }

    // ---------- Initialization ----------
    initialize() {
        // Language must be initialized first — all other methods depend on this.t()
        this.setupLanguageToggle();
        this.setupEventListeners();
        this.setupOfflineDetection();
        this.setupRealTimeValidation();
        this.setupCharacterCounters();
        this.setupSSNToggle();
        this.setupCoSSNToggle();
        this.setupFileUploads();
        this.setupConditionalFields();
        this.applyFeatureFlags();
        this.setupEmploymentConditionals();
        this.setupCoEmploymentConditionals();
        this.setupEvictionExplain();
        this.setupPriorResidenceConditional();
        this.setupCharacterCounters();
        this.restoreSavedProgress();
        this.setupGeoapify();
        this.setupInputFormatting();
        this.setupPhoneFormatting();
        this.setupIncomeFormatting();
        this.prefillFromURL();
        // Disable the section 1 Next button until a property is confirmed.
        // loadLockedProperty (or a dropdown selection) will call onPropertySelected
        // which re-enables it. This closes the window where a user could click Next
        // before the property card or dropdown has finished loading.
        this._disableSection1Next('Loading property details…');
        this.loadLockedProperty();
        this.setupTestFillVisibility();
        
        // If returning after a submit (e.g. back button), session has appId — just redirect properly
        const savedAppId = sessionStorage.getItem('lastSuccessAppId');
        if (savedAppId) {
            sessionStorage.removeItem('lastSuccessAppId');
            window.location.href = `/apply/success.html?appId=${encodeURIComponent(savedAppId)}`;
        }
    }

    // ---------- Offline detection ----------
    setupOfflineDetection() {
        window.addEventListener('online', () => {
            this.setState({ isOnline: true });
        });
        window.addEventListener('offline', () => {
            this.setState({ isOnline: false });
        });
        this.setState({ isOnline: navigator.onLine });
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.updateUIState();
    }

    updateUIState() {
        const offlineIndicator = document.getElementById('offlineIndicator');
        if (offlineIndicator) {
            offlineIndicator.style.display = this.state.isOnline ? 'none' : 'block';
        }
        const submitBtn = document.getElementById('mainSubmitBtn');
        if (submitBtn) {
            submitBtn.disabled = !this.state.isOnline;
            submitBtn.title = this.state.isOnline ? '' : 'You are offline';
        }
    }

    // ---------- Geoapify (unchanged) ----------
    setupGeoapify() {
        const apiKey = (window.CONFIG?.GEOAPIFY_API_KEY) || '';
        // Silently skip autocomplete if no API key is configured
        if (!apiKey || apiKey.includes('YOUR_')) return;
        const fields = ['propertyAddress', 'currentAddress'];
        fields.forEach(id => {
            const input = document.getElementById(id);
            if (!input) return;
            const container = document.createElement('div');
            container.style.position = 'relative';
            input.parentNode.insertBefore(container, input);
            container.appendChild(input);
            const dropdown = document.createElement('div');
            dropdown.className = 'autocomplete-dropdown';
            dropdown.style.cssText = 'position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ddd; z-index: 1000; display: none; max-height: 200px; overflow-y: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 4px;';
            container.appendChild(dropdown);
            input.addEventListener('input', this.debounce(async (e) => {
                const text = e.target.value;
                if (text.length < 3) {
                    dropdown.style.display = 'none';
                    return;
                }
                try {
                    const response = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&apiKey=${apiKey}`);
                    const data = await response.json();
                    if (data.features && data.features.length > 0) {
                        dropdown.innerHTML = '';
                        data.features.forEach(feature => {
                            const item = document.createElement('div');
                            item.style.cssText = 'padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 14px;';
                            item.textContent = feature.properties.formatted;
                            item.addEventListener('mouseover', () => item.style.background = '#f0f7ff');
                            item.addEventListener('mouseout', () => item.style.background = 'white');
                            item.addEventListener('click', () => {
                                input.value = feature.properties.formatted;
                                dropdown.style.display = 'none';
                                this.saveProgress();
                            });
                            dropdown.appendChild(item);
                        });
                        dropdown.style.display = 'block';
                    } else {
                        dropdown.style.display = 'none';
                    }
                } catch (err) {
                    console.error('Geocoding error:', err);
                    if (window.CP?.UI?.toast) CP.UI.toast('Address lookup unavailable — you can type your address manually.', 'warning');
                }
            }, 300));
            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) dropdown.style.display = 'none';
            });
        });
    }

    // ---------- Input formatting (phone, SSN) ----------
    setupInputFormatting() {
        const phoneFields = ['phone', 'landlordPhone', 'supervisorPhone', 'ref1Phone', 'ref2Phone', 'emergencyPhone', 'coPhone'];
        phoneFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    let x = e.target.value.replace(/\D/g, '').match(/(\d{0,3})(\d{0,3})(\d{0,4})/);
                    e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
                });
            }
        });
        const ssnEl = document.getElementById('ssn');
        if (ssnEl) {
            ssnEl.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, '');
                if (val.length > 4) val = val.substring(0, 4);
                e.target.value = val;
                if (val.length === 4) this.clearError(ssnEl);
            });
            ssnEl.addEventListener('blur', () => this.validateField(ssnEl));
        }
        const coSsnEl = document.getElementById('coSsn');
        if (coSsnEl) {
            coSsnEl.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, '');
                if (val.length > 4) val = val.substring(0, 4);
                e.target.value = val;
                if (val.length === 4) this.clearError(coSsnEl);
            });
        }
    }

    // ---------- Real-time validation ----------
    // Implementation lives in apply-validation.js (loaded before this file).
    // Kept as stubs so call sites are unchanged.
    setupRealTimeValidation()           { /* → apply-validation.js */ }
    setupCharacterCounters()            { /* → apply-validation.js */ }
    validateField(field)                { /* → apply-validation.js */ return true; }
    showError(field, message)           { /* → apply-validation.js */ }
    clearError(field)                   { /* → apply-validation.js */ }

    // ---------- Section navigation (unchanged) ----------
    getCurrentSection() {
        const activeSection = document.querySelector('.form-section.active');
        return activeSection ? parseInt(activeSection.id.replace('section', '')) : 1;
    }

    nextSection(currentSection) {
        if (!this.validateStep(currentSection)) return;
        this.hideSection(currentSection);
        this.showSection(currentSection + 1);
        this.updateProgressBar();
        if (currentSection + 1 === 7) {
            this.generateApplicationSummary();
            // Show co-applicant SSN column if co-applicant is present
            const hasCoApp = document.getElementById('hasCoApplicant');
            const coSsnCol = document.getElementById('coSsnCol');
            if (coSsnCol) coSsnCol.style.display = (hasCoApp && hasCoApp.checked) ? '' : 'none';
        }
    }

    previousSection(currentSection) {
        if (currentSection > 1) {
            this.hideSection(currentSection);
            this.showSection(currentSection - 1);
            this.updateProgressBar();
        }
    }

    hideSection(sectionNumber) {
        const section = document.getElementById(`section${sectionNumber}`);
        if (section) section.classList.remove('active');
    }

    showSection(sectionNumber) {
        const section = document.getElementById(`section${sectionNumber}`);
        if (section) {
            section.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    updateProgressBar() {
        const currentSection = this.getCurrentSection();
        const progress = (currentSection / 7) * 100;
        const progressFill = document.getElementById('progressFill');
        if (progressFill) progressFill.style.width = `${progress}%`;
        const progressContainer = document.querySelector('.progress-container');
        if (progressContainer) progressContainer.setAttribute('aria-valuenow', String(currentSection));
        const t = this.getTranslations();
        const stepNames = [t.step1Label, t.step2Label, t.step3Label, t.step4Label, t.step5Label, t.step6Label, t.step7Label];
        const progressText = `${t.stepPrefix} ${currentSection} ${t.stepOf} 7: ${stepNames[currentSection-1]}`;
        if (progressContainer) progressContainer.setAttribute('data-progress-text', progressText);
        for (let i = 1; i <= 7; i++) {
            const step = document.getElementById(`step${i}`);
            if (step) {
                step.classList.remove('active', 'completed');
                if (i < currentSection) step.classList.add('completed');
                if (i === currentSection) step.classList.add('active');
            }
        }
    }

    // ---------- Step validation ----------
    // Implementation lives in apply-validation.js (loaded before this file).
    validateStep(stepNumber)            { /* → apply-validation.js */ return true; }
    validatePaymentSelections()         { /* → apply-validation.js */ return true; }
    scrollToInvalidField(field)         { /* → apply-validation.js */ }

    // ---------- Feature flags ----------
    // Hides sections that are disabled in CONFIG.FEATURES.
    // Sections are wrapped in <div id="coApplicantFeature"> and <div id="vehicleInfoFeature">
    // in apply.html so they can be toggled without touching form logic.
    applyFeatureFlags() {
        const features = window.CONFIG?.FEATURES || {};

        // CO_APPLICANT — hides checkbox + co-applicant detail fields
        if (features.CO_APPLICANT === false) {
            const el = document.getElementById('coApplicantFeature');
            if (el) {
                el.style.display = 'none';
                // Uncheck the hidden checkbox so the section never validates as required
                const cb = document.getElementById('hasCoApplicant');
                if (cb) cb.checked = false;
            }
        }

        // VEHICLE_INFO — hides the vehicle radio buttons and details block
        if (features.VEHICLE_INFO === false) {
            const el = document.getElementById('vehicleInfoFeature');
            if (el) {
                el.style.display = 'none';
                // Default to "No" so vehicle fields never get submitted
                const noRadio = document.getElementById('vehicleNo');
                if (noRadio) noRadio.checked = true;
            }
        }

        // DOCUMENT_UPLOAD — placeholder for future file-upload section
        // (no UI element exists yet; flag is reserved for when the section is added)
    }

    // ---------- Conditional fields ----------
    setupConditionalFields() {
        // Payment icon grid wiring
        this.setupPaymentIconGrid();

        const petsRadio = document.getElementsByName('Has Pets');
        const petGroup = document.getElementById('petDetailsGroup');
        if (petsRadio && petGroup) {
            petsRadio.forEach(r => r.addEventListener('change', (e) => {
                petGroup.style.display = e.target.value === 'Yes' ? 'block' : 'none';
            }));
        }
        const hasCoApplicantCheck = document.getElementById('hasCoApplicant');
        const coApplicantSection = document.getElementById('coApplicantSection');
        if (hasCoApplicantCheck && coApplicantSection) {
            hasCoApplicantCheck.addEventListener('change', (e) => {
                coApplicantSection.style.display = e.target.checked ? 'block' : 'none';
                if (!e.target.checked) {
                    const inputs = coApplicantSection.querySelectorAll('input, select, textarea');
                    inputs.forEach(input => this.clearError(input));
                }
            });
        }
        const vehicleYes = document.getElementById('vehicleYes');
        const vehicleNo = document.getElementById('vehicleNo');
        const vehicleDetails = document.getElementById('vehicleDetailsSection');
        if (vehicleYes && vehicleNo && vehicleDetails) {
            const toggleVehicle = () => {
                vehicleDetails.style.display = vehicleYes.checked ? 'block' : 'none';
            };
            vehicleYes.addEventListener('change', toggleVehicle);
            vehicleNo.addEventListener('change', toggleVehicle);
        }

    // ---------- File uploads + payment icon grid ----------
    // Implementation lives in apply-files.js (loaded before this file).
    setupFileUploads()     { /* → apply-files.js */ }

    setupPaymentIconGrid() { /* → apply-files.js */ }

    setupCharacterCounters() {
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach(textarea => {
            const parent = textarea.parentElement;
            const counter = document.createElement('div');
            counter.className = 'character-count';
            counter.style.fontSize = '11px';
            counter.style.textAlign = 'right';
            counter.style.color = '#7f8c8d';
            parent.appendChild(counter);
            const updateCounter = () => {
                const len = textarea.value.length;
                const max = textarea.getAttribute('maxlength') || 500;
                counter.textContent = `${len}/${max} ${this.t('characters')}`;
            };
            textarea.addEventListener('input', updateCounter);
            updateCounter();
        });
    }

    // P1-D: Attempt to restore saved progress.
    // If a draft < 7 days old exists, show a resume/discard banner instead of silently restoring.
    restoreSavedProgress() {
        const saved = localStorage.getItem(this.config.LOCAL_STORAGE_KEY);
        if (!saved) return;
        try {
            const data = JSON.parse(saved);
            if (!data._last_updated) {
                // Legacy draft without timestamp — restore silently
                this._doRestoreFromDraft(data);
                return;
            }
            const savedMs  = new Date(data._last_updated).getTime();
            const ageMs    = Date.now() - savedMs;
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            if (ageMs > sevenDaysMs) {
                // Draft is stale — discard silently
                localStorage.removeItem(this.config.LOCAL_STORAGE_KEY);
                return;
            }
            // Draft is fresh — show resume banner
            this._showDraftResumeBanner(data, savedMs);
        } catch (e) {}
    }

    // P1-D: Render the draft-resume banner above the form.
    _showDraftResumeBanner(data, savedMs) {
        const savedDate = new Date(savedMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        const banner = document.createElement('div');
        banner.id = 'draftResumeBanner';
        banner.style.cssText = [
            'position:static', 'z-index:9999',
            'background:#0a1628', 'color:#fff', 'padding:14px 20px',
            'display:flex', 'align-items:center', 'justify-content:space-between',
            'gap:12px', 'flex-wrap:wrap', 'box-shadow:0 4px 24px rgba(0,0,0,0.25)',
            'font-family:var(--font-body,sans-serif)', 'font-size:14px', 'margin-bottom:20px'
        ].join(';');
        banner.innerHTML = `
          <span style="display:flex;align-items:center;gap:8px">
            <i class="fas fa-history" style="color:#c9a84c"></i>
            <strong>Saved draft found</strong>&nbsp;—&nbsp;last edited ${savedDate}. Resume where you left off?
          </span>
          <span style="display:flex;gap:10px;flex-shrink:0">
            <button id="draftDiscardBtn" style="padding:8px 18px;border-radius:6px;border:1px solid rgba(255,255,255,0.3);background:transparent;color:#fff;cursor:pointer;font-size:13px;font-weight:600">
              Start Fresh
            </button>
            <button id="draftResumeBtn" style="padding:8px 18px;border-radius:6px;border:none;background:#c9a84c;color:#0a1628;cursor:pointer;font-size:13px;font-weight:700">
              Resume Draft
            </button>
          </span>`;
        document.body.insertBefore(banner, document.body.firstChild);

        document.getElementById('draftResumeBtn').addEventListener('click', () => {
            this._doRestoreFromDraft(data);
            banner.remove();
        });
        document.getElementById('draftDiscardBtn').addEventListener('click', () => {
            localStorage.removeItem(this.config.LOCAL_STORAGE_KEY);
            banner.remove();
        });
    }

    // P1-D: Actual restore logic, shared by silent restore and prompted restore.
    _doRestoreFromDraft(data) {
        Object.keys(data).forEach(key => {
            if (key === 'SSN' || key === 'Co-Applicant SSN') return;
            if (key.startsWith('_')) return; // skip internal metadata keys
            const el = document.getElementById(key);
            if (el) {
                if (el.type === 'checkbox') el.checked = data[key];
                else el.value = data[key];
            }
        });

        // Restore radio button groups — saved by FormData name, not by element id
        const radioGroups = [
            'Has Pets', 'Has Vehicle', 'Ever Evicted', 'Smoker',
            'Has Bankruptcy', 'Has Criminal History', 'Additional Person Role'
        ];
        radioGroups.forEach(name => {
            const savedValue = data[name];
            if (!savedValue) return;
            const radio = document.querySelector(
                `input[name="${CSS.escape(name)}"][value="${CSS.escape(savedValue)}"]`
            );
            if (radio) radio.checked = true;
        });

        // Re-trigger conditional field visibility to match restored radio state
        const petsYes     = document.getElementById('petsYes');
        const petGroup    = document.getElementById('petDetailsGroup');
        if (petsYes && petGroup) petGroup.style.display = petsYes.checked ? '' : 'none';

        const vehicleYes    = document.getElementById('vehicleYes');
        const vehicleSect   = document.getElementById('vehicleDetailsSection');
        if (vehicleYes && vehicleSect) vehicleSect.style.display = vehicleYes.checked ? 'block' : 'none';

        const evictedYes    = document.getElementById('evictedYes');
        const evictGroup    = document.getElementById('evictionExplainGroup');
        if (evictedYes && evictGroup) evictGroup.style.display = evictedYes.checked ? '' : 'none';

        const bankruptcyYes   = document.getElementById('bankruptcyYes');
        const bankruptcyGroup = document.getElementById('bankruptcyExplainGroup');
        if (bankruptcyYes && bankruptcyGroup) bankruptcyGroup.style.display = bankruptcyYes.checked ? '' : 'none';

        const criminalYes   = document.getElementById('criminalYes');
        const criminalGroup = document.getElementById('criminalExplainGroup');
        if (criminalYes && criminalGroup) criminalGroup.style.display = criminalYes.checked ? '' : 'none';

        // Restore co-applicant employment status (saved by name, not id)
        const coStatusSaved = data['Co-Applicant Employment Status'];
        const coStatusEl    = document.getElementById('coEmploymentStatus');
        if (coStatusEl && coStatusSaved) {
            coStatusEl.value = coStatusSaved;
            const EMPLOYED = ['Full-time', 'Part-time', 'Self-employed'];
            const coEmpGroup = document.getElementById('coEmployedFieldsGroup');
            if (coEmpGroup) coEmpGroup.style.display = EMPLOYED.includes(coStatusSaved) ? '' : 'none';
        }

        // Re-trigger prior residence conditional after draft values are loaded
        const residencyStartEl   = document.getElementById('residencyStart');
        const priorResidenceGrp  = document.getElementById('priorResidenceGroup');
        if (residencyStartEl && priorResidenceGrp) {
            priorResidenceGrp.style.display = this._isUnderTwoYears(residencyStartEl.value) ? '' : 'none';
        }

        if (data._language && data._language !== this.state.language) {
            this.state.language = data._language;
            this.applyTranslations();
        }

        // If the draft included a property selection (open-dropdown path) sync
        // _selectedPropertyId and re-enable the section 1 Next button so the user
        // does not get stuck with a permanently disabled Next after resuming.
        // In the locked-property path this is a no-op since loadLockedProperty()
        // will overwrite _selectedPropertyId via onPropertySelected() anyway.
        const restoredSelect = document.getElementById('propertySelect');
        if (restoredSelect && restoredSelect.value) {
            this._selectedPropertyId = restoredSelect.value;
            this._enableSection1Next();
        }
    }

    // P1-D: Save form data to localStorage and clear the unsaved-changes flag.
    saveProgress() {
        const data = this.getAllFormData();
        const sensitiveKeys = ['SSN', 'Application ID', 'Co-Applicant SSN'];
        sensitiveKeys.forEach(key => delete data[key]);
        data._last_updated = new Date().toISOString();
        data._language = this.state.language || 'en';
        localStorage.setItem(this.config.LOCAL_STORAGE_KEY, JSON.stringify(data));
        this._hasUnsavedChanges = false;
    }

    getAllFormData() {
        const form = document.getElementById('rentalApplication');
        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => { data[key] = value; });
        return data;
    }

    debounce(func, wait) {
        let timeout;
        return function() {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, arguments), wait);
        };
    }

    // ---------- Language toggle (unchanged, includes all keys) ----------
    // ═══════════════════════════════════════════════════════════════
    // TRANSLATION SYSTEM
    // Central translations object at class level.
    // Access anywhere via: this.t('key')
    // All error messages, labels, dynamic content live here.
    // ═══════════════════════════════════════════════════════════════

    buildTranslations() {
        // Translations live in apply-translations.js (loaded before this file).
        // Kept as a method so call sites (setupLanguageToggle) are unchanged.
        this.translations = window.APPLY_TRANSLATIONS;
    }


    // ── Translation helper — use anywhere as: this.t('key') ──
    t(key) {
        const lang = this.state.language || 'en';
        return (this.translations[lang] && this.translations[lang][key]) ||
               (this.translations['en'] && this.translations['en'][key]) ||
               key;
    }

    // ── Apply translations to all data-i18n elements in the DOM ──
    applyTranslations() {
        const t = this.translations[this.state.language] || this.translations.en;
        const langBtn = document.getElementById('langText');
        if (langBtn) langBtn.textContent = t.langText;
        const langBtnDrawer = document.getElementById('langTextDrawer');
        if (langBtnDrawer) langBtnDrawer.textContent = t.langText;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (!t[key]) return;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                if (el.placeholder !== undefined) el.placeholder = t[key];
            } else if (el.tagName === 'OPTION') {
                el.textContent = t[key];
            } else {
                // data-i18n-html allows translation values that contain safe HTML (e.g., anchor tags)
                if (el.hasAttribute('data-i18n-html')) {
                    el.innerHTML = t[key];
                } else {
                    el.textContent = t[key];
                }
            }
        });

        // Rebuild Next/Prev buttons (they contain both text and icons)
        document.querySelectorAll('.btn-next').forEach(b => {
            const icon = b.querySelector('i');
            b.innerHTML = '';
            const span = document.createElement('span');
            span.setAttribute('data-i18n', 'nextStep');
            span.textContent = t.nextStep;
            b.appendChild(span);
            if (icon) b.appendChild(icon);
        });
        document.querySelectorAll('.btn-prev').forEach(b => {
            const icon = b.querySelector('i');
            b.innerHTML = '';
            if (icon) b.appendChild(icon);
            const span = document.createElement('span');
            span.setAttribute('data-i18n', 'prevStep');
            span.textContent = t.prevStep;
            b.appendChild(span);
        });

        // Re-apply employment conditional labels in current language
        const statusEl = document.getElementById('employmentStatus');
        if (statusEl && statusEl.value) {
            this._applyEmploymentLabels(statusEl.value);
        }

        // Re-apply character counter suffix in current language
        document.querySelectorAll('.character-count').forEach(counter => {
            const text = counter.textContent;
            const match = text.match(/^(\d+\/\d+)/);
            if (match) counter.textContent = `${match[1]} ${t.characters}`;
        });

        this.updateProgressBar();
        if (this.getCurrentSection() === 6) this.generateApplicationSummary();
    }

    // ── Browser language auto-detection + toggle wiring ──
    setupLanguageToggle() {
        this.buildTranslations();

        // Auto-detect browser language — default to Spanish if device is set to Spanish
        const browserLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
        if (browserLang.startsWith('es')) {
            this.state.language = 'es';
        } else {
            this.state.language = 'en';
        }

        // Apply initial translations immediately
        this.applyTranslations();

        // Wire the toggle button
        const btn = document.getElementById('langToggle');
        if (btn) {
            btn.addEventListener('click', () => {
                this.state.language = this.state.language === 'en' ? 'es' : 'en';
                this.applyTranslations();
                this.saveProgress();
            });
        }
        const btnDrawer = document.getElementById('langToggleDrawer');
        if (btnDrawer) {
            btnDrawer.addEventListener('click', () => {
                this.state.language = this.state.language === 'en' ? 'es' : 'en';
                this.applyTranslations();
                this.saveProgress();
            });
        }
    }

    // ---------- NEW: Distinguish error types ----------
    // ---------- Submission ----------
    // Implementation lives in apply-submit.js (loaded before this file).
    isTransientError(error)                 { /* → apply-submit.js */ return false; }
    showSubmissionError(error, isTransient) { /* → apply-submit.js */ }
    getCurrentSubmissionStep()              { /* → apply-submit.js */ return null; }
    updateSubmissionProgress(step, msg)     { /* → apply-submit.js */ }
    async handleFormSubmit(e)               { /* → apply-submit.js */ }
    showSubmissionProgress()                { /* → apply-submit.js */ }
    hideSubmissionProgress()                { /* → apply-submit.js */ }
    showDuplicateBanner(existingId)         { /* → apply-submit.js */ return Promise.resolve('resubmit'); }
    handleSubmissionSuccess(appId)          { /* → apply-submit.js */ }

    getTranslations() {
        return this.translations[this.state.language] || this.translations['en'];
    }

    clearSavedProgress() {
        localStorage.removeItem(this.config.LOCAL_STORAGE_KEY);
    }

    generateApplicationSummary() {
        const summaryContainer = document.getElementById('applicationSummary');
        if (!summaryContainer) return;

        const form = document.getElementById('rentalApplication');
        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => {
            if (value && key !== 'Application ID') {
                data[key] = value;
            }
        });

        const t = this.getTranslations();

        const groups = [
            { id: 1, name: 'Property & Applicant', fields: [
                'Property Address', 'Requested Move-in Date', 'Desired Lease Term',
                'First Name', 'Last Name', 'Email', 'Phone', 'DOB', 'SSN'
            ]},
            { id: 1, name: 'Co-Applicant', fields: [
                'Has Co-Applicant', 'Additional Person Role',
                'Co-Applicant First Name', 'Co-Applicant Last Name',
                'Co-Applicant Email', 'Co-Applicant Phone',
                'Co-Applicant DOB', 'Co-Applicant SSN',
                'Co-Applicant Employer', 'Co-Applicant Job Title',
                'Co-Applicant Monthly Income', 'Co-Applicant Employment Duration',
                'Co-Applicant Consent'
            ]},
            { id: 2, name: 'Residency', fields: [
                'Current Address', 'Residency Duration', 'Current Rent Amount',
                'Reason for leaving', 'Current Landlord Name', 'Landlord Phone', 'Landlord Email',
                'Government ID Type', 'Government ID Number',
                'Previous Address', 'Previous Residency Duration', 'Previous Landlord Name', 'Previous Landlord Phone'
            ]},
            { id: 2, name: 'Occupancy & Vehicles', fields: [
                'Total Occupants', 'Additional Occupants', 'Has Pets', 'Pet Details',
                'Has Vehicle', 'Vehicle Make', 'Vehicle Model', 'Vehicle Year', 'Vehicle License Plate'
            ]},
            { id: 3, name: 'Employment & Income', fields: [
                'Employment Status', 'Employer', 'Job Title', 'Employment Duration',
                'Supervisor Name', 'Supervisor Phone', 'Employment Start Date', 'Employer Address',
                'Monthly Income', 'Other Income'
            ]},
            { id: 4, name: 'Financial & References', fields: [
                'Emergency Contact Name', 'Emergency Contact Phone', 'Emergency Contact Relationship',
                'Reference 1 Name', 'Reference 1 Phone', 'Reference 1 Email', 'Reference 1 Relationship',
                'Reference 2 Name', 'Reference 2 Phone', 'Reference 2 Email', 'Reference 2 Relationship',
                'Has Bankruptcy', 'Bankruptcy Explanation', 'Has Criminal History', 'Criminal History Explanation'
            ]},
            { id: 5, name: 'Payment Preferences', fields: [
                'Primary Payment Method', 'Primary Payment Method Other',
                'Alternative Payment Method', 'Alternative Payment Method Other',
                'Third Choice Payment Method', 'Third Choice Payment Method Other'
            ]}
        ];

        const displayLabels = {
            'SSN': 'SSN (Last 4 Digits)',
            'Co-Applicant SSN': 'Co-Applicant SSN (Last 4)',
            'Has Co-Applicant': 'Has Co-Applicant/Guarantor',
            'Additional Person Role': 'Role'
        };

        // Fields to mask in the review summary
        const maskedFields = new Set(['SSN', 'Co-Applicant SSN']);

        let summaryHtml = '';
        groups.forEach(group => {
            let groupFieldsHtml = '';
            group.fields.forEach(field => {
                const value = data[field];
                const displayLabel = displayLabels[field] || field;
                if (value && value !== '') {
                    const displayValue = maskedFields.has(field) ? '••••' : value;
                    groupFieldsHtml += `
                        <div class="summary-item">
                            <div class="summary-label">${displayLabel}</div>
                            <div class="summary-value">${displayValue}</div>
                        </div>`;
                }
            });

            if (groupFieldsHtml) {
                summaryHtml += `
                    <div class="summary-group" onclick="window.app.goToSection(${group.id})" style="cursor: pointer; transition: background 0.2s;">
                        <div class="summary-header">
                            <span>${group.name}</span>
                            <span style="font-size: 12px; color: var(--secondary); display: flex; align-items: center; gap: 4px;">
                                <i class="fas fa-edit"></i> ${t.editSection}
                            </span>
                        </div>
                        <div class="summary-content">
                            ${groupFieldsHtml}
                        </div>
                    </div>`;
            }
        });

        summaryContainer.innerHTML = summaryHtml;
    }

    goToSection(sectionNumber) {
        this.hideSection(this.getCurrentSection());
        this.showSection(sectionNumber);
        this.updateProgressBar();
    }

}

// ---------- Global copy function ----------
window.copyAppId = function() {
    const appId = document.getElementById('successAppId')?.innerText;
    if (!appId) return;
    const _doToast = () => {
        const btn = document.querySelector('.copy-btn');
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        btn.style.background = '#d1fae5';
        btn.style.color = '#065f46';
        setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; btn.style.color = ''; }, 2000);
    };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(appId).then(_doToast).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = appId; ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); _doToast(); } catch(e) {}
            document.body.removeChild(ta);
        });
    } else {
        const ta = document.createElement('textarea');
        ta.value = appId; ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); _doToast(); } catch(e) {}
        document.body.removeChild(ta);
    }
};

// ============================================================
// TEST DATA FILL FUNCTIONALITY (unchanged)
// ============================================================
(function() {
    const initTestButton = () => {
        const testBtn = document.getElementById('testFillBtn');
        if (!testBtn) return;

        // Only show test button on localhost / 127.0.0.1
        const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
        const container = document.getElementById('testButtonContainer');
        if (!isLocal) {
            if (container) container.style.display = 'none';
            return;
        }
        
        testBtn.addEventListener('click', function(e) {
            e.preventDefault();
            fillTestData();
        });
    };
    
    function fillTestData() {
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + 30);
        const futureDateStr = futureDate.toISOString().split('T')[0];
        
        const pastDateStr = '1990-01-15';
        
        // Step 1
        safeSetValue('propertyAddress', '123 Main Street, Troy, MI 48083');
        safeSetValue('requestedMoveIn', futureDateStr);
        safeSetValue('firstName', 'John');
        safeSetValue('lastName', 'Testerson');
        safeSetValue('email', 'test@example.com');
        safeSetValue('phone', '(555) 123-4567');
        safeSetValue('dob', pastDateStr);
        safeSetValue('ssn', '1234');
        safeSetValue('contactTimeSpecific', 'Best after 6pm, avoid Wednesdays');
        
        safeSetSelect('desiredLeaseTerm', '12 months');
        
        safeSetCheckbox('contactMethodText', true);
        safeSetCheckbox('contactMethodEmail', true);
        
        // Co-applicant
        safeSetCheckbox('hasCoApplicant', true);
        safeSetCheckbox('roleCoApplicant', true);
        safeSetValue('coFirstName', 'Jane');
        safeSetValue('coLastName', 'Testerson');
        safeSetValue('coEmail', 'jane@example.com');
        safeSetValue('coPhone', '(555) 987-6543');
        safeSetValue('coDob', '1992-03-20');
        safeSetValue('coSsn', '5678');
        safeSetValue('coEmployer', 'ABC Corp');
        safeSetValue('coJobTitle', 'Analyst');
        safeSetValue('coMonthlyIncome', '4500');
        safeSetValue('coEmploymentDuration', '3 years');
        safeSetCheckbox('coConsent', true);
        
        // Step 2
        safeSetValue('currentAddress', '456 Oak Avenue, Troy, MI 48083');
        safeSetValue('residencyStart', '3 years 2 months');
        safeSetValue('rentAmount', '1500');
        safeSetValue('reasonLeaving', 'Relocating for work opportunity');
        safeSetValue('landlordName', 'Sarah Johnson');
        safeSetValue('landlordPhone', '(555) 987-6543');
        safeSetValue('totalOccupants', '2');
        safeSetValue('occupantNames', 'Emma (age 7, daughter)');
        
        document.getElementById('petsYes')?.click();
        safeSetValue('petDetails', 'One friendly golden retriever, 65 lbs');
        
        // Vehicle
        document.getElementById('vehicleYes')?.click();
        safeSetValue('vehicleMake', 'Toyota');
        safeSetValue('vehicleModel', 'Camry');
        safeSetValue('vehicleYear', '2020');
        safeSetValue('vehiclePlate', 'ABC123');
        
        // Step 3
        safeSetSelect('employmentStatus', 'Full-time');
        safeSetValue('employer', 'Tech Solutions Inc');
        safeSetValue('jobTitle', 'Project Manager');
        safeSetValue('employmentDuration', '2 years');
        safeSetValue('supervisorName', 'Michael Chen');
        safeSetValue('supervisorPhone', '(555) 456-7890');
        safeSetValue('monthlyIncome', '5500');
        safeSetValue('otherIncome', '500');
        
        // Step 4
        safeSetValue('ref1Name', 'Robert Miller');
        safeSetValue('ref1Phone', '(555) 222-3333');
        safeSetValue('ref2Name', 'Lisa Thompson');
        safeSetValue('ref2Phone', '(555) 444-5555');
        safeSetValue('emergencyName', 'Jane Testerson');
        safeSetValue('emergencyPhone', '(555) 666-7777');
        safeSetValue('emergencyRelationship', 'Spouse');
        
        document.getElementById('evictedNo')?.click();
        document.getElementById('smokeNo')?.click();
        
        // Step 5 — payment icon grid (click Venmo as primary, PayPal as backup)
        const venmoCard  = document.querySelector('.payment-icon-card[data-method="Venmo"]');
        const paypalCard = document.querySelector('.payment-icon-card[data-method="PayPal"]');
        if (venmoCard)  venmoCard.click();
        if (paypalCard) paypalCard.click();
        
        // Step 6
        safeSetCheckbox('fcraConsent', true);
        safeSetCheckbox('certifyCorrect', true);
        safeSetCheckbox('authorizeVerify', true);
        safeSetCheckbox('termsAgree', true);
        
        if (window.app && typeof window.app.saveProgress === 'function') {
            window.app.saveProgress();
        }
        
        showTestFillNotification();
        
        if (window.app && typeof window.app.showSection === 'function') {
            window.app.showSection(1);
            window.app.updateProgressBar();
        }
    }
    
    function safeSetValue(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
        }
    }
    
    function safeSetSelect(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.value = value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
    
    function safeSetCheckbox(id, checked) {
        const el = document.getElementById(id);
        if (el) {
            el.checked = checked;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
    
    function showTestFillNotification() {
        const existing = document.getElementById('testFillNotification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.id = 'testFillNotification';
        notification.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>Test data filled! You can now edit any field.</span>
        `;
        notification.style.cssText = `
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: #10b981;
            color: white;
            padding: 16px 24px;
            border-radius: 60px;
            font-weight: 500;
            box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.5);
            z-index: 100000;
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideDown 0.3s ease;
            border: 2px solid white;
        `;
        
        if (!document.getElementById('testNotificationStyle')) {
            const style = document.createElement('style');
            style.id = 'testNotificationStyle';
            style.textContent = `
                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translate(-50%, -20px);
                    }
                    to {
                        opacity: 1;
                        transform: translate(-50%, 0);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification) {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.3s';
                setTimeout(() => notification.remove(), 300);
            }
        }, 3000);
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTestButton);
    } else {
        initTestButton();
    }
})();

// ---------- Apply mixins ----------
// Each companion file sets a window.APPLY_* object loaded before this file.
// Object.assign overwrites the stub methods with real implementations.
// `this` inside each method still refers to the RentalApplication instance.
[
    ['APPLY_PROPERTY',     'apply-property.js'],
    ['APPLY_TRANSLATIONS', 'apply-translations.js'],
    ['APPLY_VALIDATION',   'apply-validation.js'],
    ['APPLY_FILES',        'apply-files.js'],
    ['APPLY_SUBMIT',       'apply-submit.js'],
].forEach(([key, file]) => {
    if (window[key]) {
        Object.assign(RentalApplication.prototype, window[key]);
    } else {
        console.error(`[apply.js] ${file} was not loaded before apply.js — some features will not work.`);
    }
});

// ---------- Initialize app ----------
document.addEventListener('DOMContentLoaded', () => {
    window.app = new RentalApplication();
    const s1 = document.getElementById('section1');
    if (s1) s1.classList.add('active');
});