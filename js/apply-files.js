// Choice Properties — apply-files.js
// File upload and payment icon grid setup for the RentalApplication class.
// Loaded before apply.js. Applied via Object.assign(RentalApplication.prototype, ...) at end of apply.js.
//
// Methods provided:
//   setupFileUploads()     — drag-and-drop + click-to-upload for ID, income, and additional doc zones
//   setupPaymentIconGrid() — primary/backup payment method selection via icon cards

/* global window */
window.APPLY_FILES = {

    setupFileUploads() {
        const zones = [
            { zoneId: 'idUploadZone',         triggerId: 'idUploadTrigger',         inputId: 'docIdUpload',
              previewId: 'idUploadPreview',     filenameId: 'idUploadFilename',       removeId: 'idUploadRemove',     stateKey: 'docId' },
            { zoneId: 'incomeUploadZone',      triggerId: 'incomeUploadTrigger',     inputId: 'docIncomeUpload',
              previewId: 'incomeUploadPreview', filenameId: 'incomeUploadFilename',   removeId: 'incomeUploadRemove', stateKey: 'docIncome' },
            { zoneId: 'additionalUploadZone',  triggerId: 'additionalUploadTrigger', inputId: 'docAdditionalUpload',
              previewId: 'additionalUploadPreview', filenameId: 'additionalUploadFilename', removeId: 'additionalUploadRemove', stateKey: 'docAdditional' },
        ];

        if (!this._uploadedDocs) this._uploadedDocs = {};
        const MAX_SIZE = 10 * 1024 * 1024;
        const ALLOWED  = ['image/jpeg', 'image/png', 'application/pdf'];

        const processFile = (file, cfg) => {
            if (!ALLOWED.includes(file.type)) { CP.UI.toast('Please upload a JPG, PNG, or PDF file.', 'error'); return; }
            if (file.size > MAX_SIZE)          { CP.UI.toast('File exceeds 10 MB. Please upload a smaller file.', 'error'); return; }
            this._uploadedDocs[cfg.stateKey] = file;
            const fnEl      = document.getElementById(cfg.filenameId);
            const previewEl = document.getElementById(cfg.previewId);
            const contentEl = document.getElementById(cfg.triggerId);
            if (fnEl)      fnEl.textContent = file.name;
            if (previewEl) previewEl.style.display = 'flex';
            if (contentEl) contentEl.style.display = 'none';
        };

        zones.forEach(cfg => {
            const zone      = document.getElementById(cfg.zoneId);
            const trigger   = document.getElementById(cfg.triggerId);
            const input     = document.getElementById(cfg.inputId);
            const removeBtn = document.getElementById(cfg.removeId);
            if (!zone || !trigger || !input) return;

            trigger.addEventListener('click', () => input.click());
            input.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) processFile(f, cfg); });

            zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('upload-zone-drag'); });
            zone.addEventListener('dragleave', ()  => zone.classList.remove('upload-zone-drag'));
            zone.addEventListener('drop',      (e) => {
                e.preventDefault(); zone.classList.remove('upload-zone-drag');
                const f = e.dataTransfer.files[0]; if (f) processFile(f, cfg);
            });

            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    delete this._uploadedDocs[cfg.stateKey];
                    input.value = '';
                    const previewEl = document.getElementById(cfg.previewId);
                    const contentEl = document.getElementById(cfg.triggerId);
                    if (previewEl) previewEl.style.display = 'none';
                    if (contentEl) contentEl.style.display = 'flex';
                });
            }
        });
    },

    setupPaymentIconGrid() {
        const grid          = document.getElementById('paymentIconGrid');
        if (!grid) return;
        const primaryInput  = document.getElementById('primaryPayment');
        const backupInput   = document.getElementById('secondaryPayment');
        const otherInline   = document.getElementById('paymentOtherInline');
        let primaryCard     = null;
        let backupCard      = null;

        const updateBadge = (card, text, show) => {
            const badge = card.querySelector('.pic-badge');
            if (!badge) return;
            badge.textContent = text;
            badge.style.display = show ? 'block' : 'none';
        };

        const updateInputs = () => {
            if (primaryInput) primaryInput.value = primaryCard ? primaryCard.dataset.method : '';
            if (backupInput)  backupInput.value  = backupCard  ? backupCard.dataset.method  : '';
            const showOther = (primaryCard && primaryCard.dataset.method === 'Other') ||
                              (backupCard  && backupCard.dataset.method  === 'Other');
            if (otherInline) otherInline.classList.toggle('visible', !!showOther);
        };

        grid.querySelectorAll('.payment-icon-card').forEach(card => {
            card.addEventListener('click', () => {
                if (card === primaryCard) {
                    card.classList.remove('is-primary');
                    updateBadge(card, '', false);
                    primaryCard = backupCard;
                    backupCard  = null;
                    if (primaryCard) {
                        primaryCard.classList.remove('is-backup');
                        primaryCard.classList.add('is-primary');
                        updateBadge(primaryCard, 'Primary', true);
                    }
                } else if (card === backupCard) {
                    card.classList.remove('is-backup');
                    updateBadge(card, '', false);
                    backupCard = null;
                } else if (!primaryCard) {
                    primaryCard = card;
                    card.classList.add('is-primary');
                    updateBadge(card, 'Primary', true);
                } else {
                    if (backupCard) { backupCard.classList.remove('is-backup'); updateBadge(backupCard, '', false); }
                    backupCard = card;
                    card.classList.add('is-backup');
                    updateBadge(card, 'Backup', true);
                }
                updateInputs();
                const errEl = document.getElementById('primaryPaymentError');
                if (primaryCard && errEl) errEl.style.display = 'none';
            });
        });
    },

};
