// ─────────────────────────────────────────────────────────────────────────────
// apply-property.js — Property selection, locked card, and context banner
// Companion module for apply.js — loaded before apply.js via <script defer>.
// Sets window.APPLY_PROPERTY which apply.js merges into RentalApplication.prototype.
// ─────────────────────────────────────────────────────────────────────────────

window.APPLY_PROPERTY = {
async loadPropertyDropdown() {
    const select = document.getElementById('propertySelect');
    if (!select) return;
    try {
        const { data: props, error } = await window.CP.sb()
            .from('properties')
            .select('id, title, address, city, state, zip, monthly_rent, application_fee, bedrooms, bathrooms, available_date')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        select.innerHTML = '<option value="">— Select a property —</option>';

        if (error || !props || props.length === 0) {
            select.innerHTML = '<option value="">No properties currently available</option>';
            return;
        }

        // Store properties for fee lookup
        this._properties = {};
        props.forEach(p => {
            this._properties[p.id] = p;
            const beds  = p.bedrooms  ? `${p.bedrooms}bd` : '';
            const baths = p.bathrooms ? `${p.bathrooms}ba` : '';
            const rent  = p.monthly_rent ? ` · $${parseInt(p.monthly_rent).toLocaleString()}/mo` : '';
            const label = `${p.title} — ${p.address}, ${p.city}, ${p.state}${rent}${beds||baths ? ' · ' + [beds,baths].filter(Boolean).join('/') : ''}`;
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = label;
            select.appendChild(opt);
        });

        // Listen for selection changes (onchange prevents duplicate listeners on re-call)
        select.onchange = (e) => this.onPropertySelected(e.target.value);

    } catch (err) {
        select.innerHTML = '<option value="">Unable to load properties — please refresh</option>';
    }
}

// ---------- Section 1 Next button helpers ----------
// The Next button for step 1 is disabled at page load and only enabled once
// a property is confirmed selected (locked or chosen from the dropdown).
_getSection1NextBtn() {
    return document.querySelector('#section1 .btn-next');
}
_enableSection1Next() {
    const btn = this._getSection1NextBtn();
    if (!btn) return;
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.cursor  = '';
    btn.title = '';
}
_disableSection1Next(reason) {
    const btn = this._getSection1NextBtn();
    if (!btn) return;
    btn.disabled = true;
    btn.style.opacity = '0.55';
    btn.style.cursor  = 'not-allowed';
    btn.title = reason || '';
}

// ---------- Build a property object from sessionStorage (or bare stub) ----------
// Reads the cp_property_context written by buildApplyURL(). Falls back to a
// minimal stub when sessionStorage is empty (e.g. direct URL share, new tab).
// The full live record is always fetched by _verifyAndRefreshProperty(). (M-03)
_buildPropertyFromURLParams(id) {
    try {
        const raw = sessionStorage.getItem('cp_property_context');
        if (raw) {
            const ctx = JSON.parse(raw);
            if (ctx && ctx.id === id) {
                const addr = [ctx.address, ctx.city, ctx.state, ctx.zip].filter(Boolean).join(', ');
                return {
                    id,
                    _formattedAddress: addr,
                    address:           ctx.address          || '',
                    city:              ctx.city             || '',
                    state:             ctx.state            || '',
                    zip:               ctx.zip              || '',
                    title:             ctx.title            || 'Selected Property',
                    monthly_rent:      ctx.monthly_rent     || null,
                    application_fee:   ctx.application_fee  || 0,
                    available_date:    ctx.available_date   || null,
                    landlord_id:       ctx.landlord_id      || null,
                    bedrooms:          ctx.bedrooms         || null,
                    bathrooms:         ctx.bathrooms        || null,
                };
            }
        }
    } catch (_) {}
    // Fallback: sessionStorage unavailable or context is for a different property.
    // _verifyAndRefreshProperty() will fill in all fields shortly.
    return { id, _formattedAddress: '', address: '', city: '', state: '', zip: '',
             title: 'Loading…', monthly_rent: null, application_fee: 0,
             available_date: null, bedrooms: null, bathrooms: null };
}

// ---------- Background Supabase verify + data refresh ----------
// Called after the locked card is already showing (built from URL params).
// Fetches the live property record to confirm it is still active and to enrich
// the stored prop with fields the URL does not carry (beds, baths, lease terms…).
async _verifyAndRefreshProperty(propertyId) {
    try {
        const { data: prop, error } = await window.CP.sb()
            .from('properties')
            .select(`
                id, title, address, city, state, zip,
                monthly_rent, application_fee,
                bedrooms, bathrooms, available_date,
                pets_allowed, smoking_allowed,
                pet_types_allowed, pet_weight_limit,
                lease_terms, minimum_lease_months
            `)
            .eq('id', propertyId)
            .eq('status', 'active')
            .single();

        if (error || !prop) {
            this._showPropertyUnavailableInCard();
            return;
        }

        // Enrich stored record with live data (adds beds/baths, lease terms, etc.)
        this._properties[propertyId] = prop;

        // Persist fresh full context to sessionStorage for success page and other views
        sessionStorage.setItem('cp_property_context', JSON.stringify({
            id:               prop.id,
            title:            prop.title,
            address:          prop.address,
            city:             prop.city,
            state:            prop.state,
            zip:              prop.zip              || '',
            monthly_rent:     prop.monthly_rent     || null,
            application_fee:  prop.application_fee  || 0,
            available_date:   prop.available_date   || null,
            bedrooms:         prop.bedrooms         || null,
            bathrooms:        prop.bathrooms        || null,
        }));

        // Refresh locked card meta and banners with the now-complete live data
        this._activatePropertyLock(propertyId);
        this.onPropertySelected(propertyId);

    } catch (err) {
        // Silent — URL-param data is sufficient for the form to work offline or
        // when Supabase is temporarily unreachable.
    }
}

// ---------- Show unavailable notice inside the locked card ----------
_showPropertyUnavailableInCard() {
    const card    = document.getElementById('propertyLockedCard');
    const titleEl = document.getElementById('lockedCardTitle');
    const metaEl  = document.getElementById('lockedCardMeta');
    if (card) {
        card.style.background   = '#fef2f2';
        card.style.borderColor  = '#fca5a5';
    }
    if (titleEl) titleEl.textContent = 'This property is no longer available';
    if (metaEl)  metaEl.textContent  = 'The listing may have been rented or removed. Please choose another property.';
    this._disableSection1Next('This property is no longer available — please go back and choose another.');
}

// ---------- Property load — handles both linked and direct visits ----------
// Two-phase approach:
//   Phase 1 (instant) — build the locked card from URL params so there is zero
//                        perceived latency for users arriving from a listing page.
//   Phase 2 (background) — fetch the live Supabase record to verify the property
//                          is still active and to enrich with beds/baths/lease terms.
// If there is no propertyId in the URL the full property dropdown is shown instead.
async loadLockedProperty() {
    // Support both legacy ?propertyId= and new clean ?id= param (M-03)
    const _p = new URLSearchParams(window.location.search);
    const propertyId = _p.get('id') || _p.get('propertyId');

    if (!propertyId) {
        // No property in URL — open dropdown for free selection
        const group = document.getElementById('propertySelectGroup');
        if (group) group.style.display = '';
        await this.loadPropertyDropdown();
        return;
    }

    // ── Phase 1: instant locked card from URL params ─────────────────────
    const urlProp = this._buildPropertyFromURLParams(propertyId);
    this._properties = { [propertyId]: urlProp };

    // Set select value and remove `required` before calling onPropertySelected
    // so the hidden select never triggers unwanted browser or custom validation
    // while the locked card is showing.
    const selectEl = document.getElementById('propertySelect');
    if (selectEl) {
        selectEl.value = propertyId;
        selectEl.removeAttribute('required');
    }

    this.onPropertySelected(propertyId);   // sets _selectedPropertyId, fills fields, enables Next
    this._activatePropertyLock(propertyId); // swaps dropdown → locked card

    // ── Phase 2: background verify + data refresh (non-blocking) ─────────
    this._verifyAndRefreshProperty(propertyId);
}

// ---------- Invalid property message — shown when the URL carries no valid propertyId ----------
_showInvalidPropertyMessage() {
    const form = document.getElementById('rentalApplication');
    if (form) form.style.display = 'none';

    const container = document.querySelector('.container');
    if (!container) return;

    const msg = document.createElement('div');
    msg.style.cssText = 'text-align:center;padding:60px 24px;';
    msg.innerHTML = `
        <div style="font-size:48px;margin-bottom:16px;line-height:1;">&#128279;</div>
        <h2 style="font-size:1.4rem;color:#1a2233;margin-bottom:10px;">This link is no longer valid</h2>
        <p style="color:#6b7280;font-size:.95rem;max-width:420px;margin:0 auto 28px;line-height:1.6;">
            The property listing you followed may have been removed, is no longer active, or this link has expired.
            Please return to the listings page to find an available property.
        </p>
        <a href="/index.html" style="display:inline-block;background:#0f1117;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:.9rem;font-weight:600;letter-spacing:.02em;">
            &#8592; View All Listings
        </a>
    `;
    container.appendChild(msg);
}

// ---------- Handle property selection — fill hidden fields + show fee ----------
onPropertySelected(propertyId) {
    const prop = this._properties && this._properties[propertyId];

    // Single source of truth — everything that needs the selected property ID
    // should read this._selectedPropertyId rather than querying the DOM.
    this._selectedPropertyId = propertyId || null;

    // Reflect selection state in the section 1 Next button
    if (propertyId) {
        this._enableSection1Next();
    } else {
        this._disableSection1Next();
    }

    // Update hidden address field used by form submission.
    // Prefer _formattedAddress (pre-built from URL params) over re-formatting
    // individual components to avoid trailing ", , " when city/state are blank.
    const addrField = document.getElementById('propertyAddress');
    if (addrField) {
        addrField.value = prop
            ? (prop._formattedAddress || `${prop.address}, ${prop.city}, ${prop.state} ${prop.zip || ''}`.trim())
            : '';
    }

    // Update fee hidden field
    const feeField = document.getElementById('selectedPropertyFee');
    const fee = prop ? (parseInt(prop.application_fee) || 0) : 0;
    if (feeField) feeField.value = fee;

    // Update fee bar above move-in date
    const feeBar = document.getElementById('propertyFeeBar');
    if (feeBar) {
        if (prop) {
            document.getElementById('feeBarAmount').textContent = fee === 0 ? 'Free' : `$${fee}`;
            document.getElementById('feeBarTitle').textContent  = fee === 0 ? 'No application fee for this property' : `Application Fee: $${fee}`;
            document.getElementById('feeBarDesc').textContent   = fee === 0 ? 'This property has no application fee.' : 'Our team will contact you to arrange payment after submission.';
            feeBar.style.display = 'flex';
        } else {
            feeBar.style.display = 'none';
        }
    }

    // Update fee display in step 6 review
    const feeAmountEl  = document.getElementById('feeAmountDisplay');
    const feeTitleEl   = document.getElementById('feeTitleText');
    const feeDisplayEl = document.getElementById('feeDisplay');
    const reminderEl   = document.getElementById('paymentReminder');
    if (feeAmountEl)  feeAmountEl.textContent  = fee === 0 ? 'Free' : `$${fee}`;
    if (feeTitleEl)   feeTitleEl.textContent   = fee === 0 ? 'No Application Fee' : `Application Fee: $${fee}.00`;
    if (feeDisplayEl) feeDisplayEl.style.display = fee === 0 ? 'none' : '';
    if (reminderEl)   reminderEl.style.display   = fee === 0 ? 'none' : '';

    // Update property confirm banner
    const banner = document.getElementById('propertyConfirmBanner');
    if (banner && prop) {
        document.getElementById('pcbTitle').textContent = prop.title;
        const metaParts = [];
        const displayAddr = prop._formattedAddress || [prop.address, prop.city, prop.state].filter(Boolean).join(', ');
        metaParts.push(`<i class="fas fa-map-marker-alt" style="margin-right:4px;color:#c9a84c"></i>${displayAddr}`);
        if (prop.monthly_rent) metaParts.push(`<strong>$${parseInt(prop.monthly_rent).toLocaleString()}/mo</strong>`);
        if (prop.bedrooms || prop.bathrooms) metaParts.push(`${prop.bedrooms||'?'}bd / ${prop.bathrooms||'?'}ba`);
        document.getElementById('pcbMeta').innerHTML = metaParts.join(' &nbsp;·&nbsp; ');
        banner.style.display = 'flex';
    } else if (banner) {
        banner.style.display = 'none';
    }

    // Keep sessionStorage in sync so the success page always shows the correct
    // property context — covers the dropdown path, the escape-hatch + re-select
    // path, and the locked-arrival path (harmless double-write).
    if (prop) {
        sessionStorage.setItem('cp_property_context', JSON.stringify({
            id:              prop.id,
            title:           prop.title,
            address:         prop.address,
            city:            prop.city,
            state:           prop.state,
            zip:             prop.zip             || '',
            monthly_rent:    prop.monthly_rent    || null,
            application_fee: prop.application_fee || 0,
            available_date:  prop.available_date  || null,
            bedrooms:        prop.bedrooms        || null,
            bathrooms:       prop.bathrooms       || null,
        }));
    } else {
        sessionStorage.removeItem('cp_property_context');
    }

    this._showContextBanner(prop);
}

// ---------- Lock property selection when arriving from a listing ----------
// Called only when all three conditions are met (see loadPropertyDropdown).
// Hides the dropdown and shows a locked property card in its place.
// The escape hatch restores the dropdown if the user needs to change property.
_activatePropertyLock(propertyId) {
    const prop  = this._properties && this._properties[propertyId];
    const group = document.getElementById('propertySelectGroup');
    const card  = document.getElementById('propertyLockedCard');
    if (!prop || !group || !card) return;

    // Build the detail line shown beneath the property title.
    // Use _formattedAddress (pre-built from URL params) when available so the card
    // renders correctly even before the Supabase verify fetch returns.
    const rent  = prop.monthly_rent ? `$${parseInt(prop.monthly_rent).toLocaleString()}/mo` : '';
    const beds  = prop.bedrooms     ? `${prop.bedrooms} bed`  : '';
    const baths = prop.bathrooms    ? `${prop.bathrooms} bath` : '';
    const addr  = prop._formattedAddress || [prop.address, prop.city, prop.state].filter(Boolean).join(', ');
    const meta  = [addr, rent, [beds, baths].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');

    document.getElementById('lockedCardTitle').textContent = prop.title;
    document.getElementById('lockedCardMeta').textContent  = meta;

    // Swap: hide dropdown group, show locked card
    group.style.display = 'none';
    card.style.display  = 'flex';

    // Keep the hidden select in sync. `required` has already been removed by
    // loadLockedProperty so it does not trigger browser or custom validation
    // while the locked card is visible.
    const select = document.getElementById('propertySelect');
    if (select) select.value = propertyId;

    // Escape hatch — clicking "Not this property?" restores the open dropdown.
    // Restore `required` on the select so the open-dropdown flow validates normally.
    const escapeBtn = document.getElementById('propertyLockEscape');
    if (escapeBtn) {
        escapeBtn.style.display = '';
        escapeBtn.onclick = async () => {
            card.style.display  = 'none';
            group.style.display = '';
            const sel = document.getElementById('propertySelect');
            if (sel) {
                sel.value = '';
                sel.setAttribute('required', '');
            }
            this.onPropertySelected('');   // clears _selectedPropertyId, disables Next
            await this.loadPropertyDropdown();
        };
    }

    this._showContextBanner(prop);
}

// ---------- Persistent property context banner (above all steps) ----------
_showContextBanner(prop) {
    const banner = document.getElementById('propertyContextBanner');
    if (!banner) return;
    if (!prop) { this._hideContextBanner(); return; }
    document.getElementById('pcbContextTitle').textContent = prop.title;
    const metaParts = [];
    const displayAddr = prop._formattedAddress || [prop.address, prop.city, prop.state].filter(Boolean).join(', ');
    metaParts.push(`<i class="fas fa-map-marker-alt" style="margin-right:4px;color:#c9a84c"></i>${displayAddr}`);
    if (prop.monthly_rent) metaParts.push(`<strong>$${parseInt(prop.monthly_rent).toLocaleString()}/mo</strong>`);
    if (prop.bedrooms || prop.bathrooms) metaParts.push(`${prop.bedrooms||'?'}bd / ${prop.bathrooms||'?'}ba`);
    document.getElementById('pcbContextMeta').innerHTML = metaParts.join(' &nbsp;·&nbsp; ');
    banner.style.display = 'flex';
}

_hideContextBanner() {
    const banner = document.getElementById('propertyContextBanner');
    if (banner) banner.style.display = 'none';
}

};
