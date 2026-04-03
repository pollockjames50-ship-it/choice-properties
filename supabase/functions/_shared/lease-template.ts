// Choice Properties — Shared: lease-template.ts
// Generates the signed lease HTML document.
// Used by: sign-lease/index.ts
// Extracted from sign-lease in Session 014 (I-009).

import { escHtml } from './utils.ts';

function fmt(n: any) { return parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(d: any) { return d ? new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—' }

// Build the full signed-lease HTML for PDF/storage
export function buildLeaseHTML(app: any, coApp: any): string {
  const tenantName    = `${escHtml(app.first_name)} ${escHtml(app.last_name)}`
  const coName        = app.has_co_applicant && coApp?.first_name
    ? `${escHtml(coApp.first_name)} ${escHtml(coApp.last_name || '')}`.trim() : null
  const landlordName  = escHtml(app.lease_landlord_name  || 'Choice Properties')
  const landlordAddr  = escHtml(app.lease_landlord_address || 'Nationwide')
  const lateFeeFlat   = fmt(app.lease_late_fee_flat  || 50)
  const lateFeeDaily  = fmt(app.lease_late_fee_daily || 10)
  const petPolicy     = escHtml(app.lease_pets_policy    || 'No pets permitted without prior written consent.')
  const smokingPolicy = escHtml(app.lease_smoking_policy || 'Smoking strictly prohibited on Premises.')

  let compliance: any = {}
  try { compliance = JSON.parse(app.lease_compliance_snapshot || '{}') } catch(_) {}
  const eSignLaw      = compliance.eSignLaw    || 'E-SIGN Act (15 U.S.C. §7001)'
  const depositReturn = compliance.depositReturn || 30
  const noticeDays    = compliance.noticeToVacate || 30
  const gracePeriod   = compliance.gracePeriod ?? 5
  const disclosures: string[] = compliance.disclosures || ['Lead paint disclosure for pre-1978 properties']
  const today         = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
  const signedAt      = app.lease_signed_date
    ? new Date(app.lease_signed_date).toLocaleString('en-US', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : today
  const isMtM         = (app.desired_lease_term || '').toLowerCase().includes('month-to-month')
    || (app.desired_lease_term || '').toLowerCase() === 'month to month'
  const termType      = app.desired_lease_term || '12-Month Fixed Term'
  const endDateDisplay = isMtM ? 'Month-to-Month (no fixed end date)' : fmtDate(app.lease_end_date)
  const termNarrative = isMtM
    ? `This tenancy shall commence on <strong>${fmtDate(app.lease_start_date)}</strong> and shall continue on a month-to-month basis, terminable by either party upon <strong>${noticeDays} days</strong> written notice. There is no fixed end date.`
    : `The tenancy shall commence on <strong>${fmtDate(app.lease_start_date)}</strong> and terminate on <strong>${fmtDate(app.lease_end_date)}</strong>. This Agreement shall not automatically convert to a month-to-month tenancy after the Termination Date without express written agreement by both parties.`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Signed Lease — ${escHtml(app.app_id)}</title>
<style>
  body { font-family: Georgia, serif; font-size: 13px; line-height: 1.8; color: #1a1a1a; max-width: 760px; margin: 0 auto; padding: 40px 30px; }
  h1 { font-size: 18px; text-align: center; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 12px; color: #555; margin-bottom: 30px; }
  h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 22px 0 10px; }
  table.info { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.info td { padding: 5px 8px; border: 1px solid #ddd; }
  table.info td:first-child { width: 38%; background: #f5f5f5; font-weight: 600; }
  .fin-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; font-size: 12px; }
  .fin-total { font-weight: 700; font-size: 13px; padding-top: 6px; }
  p { margin: 6px 0; }
  .sig-block { border: 1px solid #999; border-radius: 4px; padding: 14px 18px; margin: 8px 0; background: #fafafa; }
  .sig-name { font-family: Georgia, serif; font-style: italic; font-size: 20px; color: #0a1628; border-bottom: 2px solid #0a1628; padding-bottom: 4px; display: inline-block; min-width: 280px; }
  .sig-meta { font-size: 10px; color: #666; margin-top: 6px; }
  .disclosure { background: #fff8e1; border-left: 3px solid #f59e0b; padding: 8px 12px; margin: 6px 0; font-size: 11px; }
  .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 14px; font-size: 10px; color: #777; text-align: center; }
  .stamp { background: #d1fae5; border: 2px solid #059669; border-radius: 6px; padding: 10px 16px; text-align: center; font-weight: 700; color: #065f46; font-size: 13px; margin-bottom: 24px; }
</style>
</head>
<body>
<h1>Residential Lease Agreement</h1>
<div class="subtitle">Signed Copy — ${escHtml(app.app_id)} — Generated ${today}</div>

<div class="stamp">✓ Electronically Executed — Legally Binding Document</div>

<h2>Article 1 — Parties and Premises</h2>
<table class="info">
  <tr><td>Landlord</td><td><strong>${landlordName}</strong><br><span style="font-size:11px;color:#555">${landlordAddr}</span></td></tr>
  <tr><td>Tenant</td><td><strong>${tenantName}</strong>${coName ? `<br>Co-Applicant: <strong>${coName}</strong>` : ''}</td></tr>
  <tr><td>Premises</td><td><strong>${escHtml(app.property_address || '—')}</strong></td></tr>
  <tr><td>Application Reference</td><td style="font-family:monospace">${escHtml(app.app_id)}</td></tr>
</table>

<h2>Article 2 — Lease Term</h2>
<table class="info">
  <tr><td>Commencement Date</td><td><strong>${fmtDate(app.lease_start_date)}</strong></td></tr>
  <tr><td>Termination Date</td><td><strong>${endDateDisplay}</strong></td></tr>
  <tr><td>Lease Type</td><td>${escHtml(termType)}</td></tr>
</table>
<p>${termNarrative}</p>

<h2>Article 3 — Rent</h2>
<div class="fin-row"><span>Monthly Rent</span><span><strong>$${fmt(app.monthly_rent)}</strong></span></div>
<div class="fin-row"><span>Security Deposit</span><span><strong>$${fmt(app.security_deposit)}</strong></span></div>
<div class="fin-row fin-total"><span>Total Due at Move-In</span><span>$${fmt(app.move_in_costs)}</span></div>
<p style="margin-top:10px">Rent of <strong>$${fmt(app.monthly_rent)}</strong> is due on the first (1st) day of each calendar month via a payment method agreed with the Landlord's leasing team.</p>

<h2>Article 4 — Late Fees</h2>
<p>Rent not received within <strong>${gracePeriod} days</strong> of the due date (as permitted by applicable state law) shall be subject to a flat late fee of <strong>$${lateFeeFlat}</strong>, plus <strong>$${lateFeeDaily} per day</strong> for each additional day rent remains unpaid thereafter. Time is of the essence with respect to rent payment.</p>

<h2>Article 5 — Security Deposit</h2>
<p>A security deposit of <strong>$${fmt(app.security_deposit)}</strong> is held by Landlord and will be returned within <strong>${depositReturn} days</strong> of lease termination as required by applicable state law, less any deductions itemized in writing for damages beyond normal wear and tear or unpaid rent.</p>

<h2>Article 6 — Move-In Costs</h2>
<p>Prior to taking possession, Tenant shall pay the total move-in amount of <strong>$${fmt(app.move_in_costs)}</strong> (first month's rent of $${fmt(app.monthly_rent)} + security deposit of $${fmt(app.security_deposit)}). Possession is not delivered until all move-in funds are received and confirmed.</p>

<h2>Article 7 — Utilities</h2>
<p>Unless otherwise specified in a separate written addendum signed by both parties, Tenant shall be solely responsible for establishing service accounts and paying all costs for utilities serving the Premises, including but not limited to electricity, natural gas, water, sewer, trash collection, telephone, internet, and cable or streaming services. Landlord shall not be liable for any interruption, failure, or reduction in utility service not caused by Landlord's direct action.</p>

<h2>Article 8 — Use of Premises</h2>
<p>The Premises shall be used solely as a private residential dwelling by the named Tenant(s) and approved occupants listed in the application. No commercial activity, subletting, or assignment of this Agreement is permitted without the prior written consent of Landlord. Tenant shall comply with all applicable laws, ordinances, homeowner association rules, and community guidelines.</p>

<h2>Article 9 — Maintenance and Repairs</h2>
<p>Tenant shall maintain the Premises in a clean, sanitary, and habitable condition. Tenant shall promptly notify Landlord in writing of any damage or required repairs. Tenant is responsible for all damage caused by negligence or intentional acts of Tenant, guests, or occupants. No structural or cosmetic alterations shall be made to the Premises without prior written consent of Landlord.</p>

<h2>Article 10 — Entry by Landlord</h2>
<p>Landlord or Landlord's authorized agents may enter the Premises at reasonable times with advance notice as required by applicable state law for purposes including inspection, repairs, or showing the Premises to prospective tenants or purchasers. In cases of emergency, Landlord may enter without prior notice.</p>

<h2>Article 11 — Pets and Smoking</h2>
<p><strong>Pets:</strong> ${petPolicy}</p>
<p><strong>Smoking:</strong> ${smokingPolicy}</p>

<h2>Article 12 — Default and Termination</h2>
<p>A material breach of this Agreement — including but not limited to non-payment of rent after the <strong>${gracePeriod}-day</strong> grace period, unauthorized subletting, or violation of community rules — entitles Landlord to deliver written notice of termination as required by applicable state law (minimum <strong>${noticeDays} days</strong> written notice for this jurisdiction). Tenant shall vacate the Premises on or before the date specified in such notice. Holdover tenancy without Landlord's written consent shall result in Tenant's liability for double rent and all damages caused thereby.</p>

<h2>Article 13 — Early Termination</h2>
<p>If Tenant wishes to terminate this Agreement before the Termination Date specified in Article 2, Tenant shall provide Landlord with written notice as required under Article 14 and shall remain obligated for all rent and charges through the earlier of: (i) the Termination Date, or (ii) the date a qualified replacement tenant, approved by Landlord, takes possession of the Premises. Landlord shall make commercially reasonable efforts to re-let the Premises to mitigate Tenant's continuing liability. Tenant's early termination obligations are governed by applicable state law.</p>

<h2>Article 14 — Notice to Vacate</h2>
<p>Either party may terminate this Agreement at the end of the lease term upon written notice delivered to the other party as required by applicable state law. For this jurisdiction, a minimum of <strong>${noticeDays} days</strong> written notice is required prior to the intended move-out date.</p>

<h2>Article 15 — Governing Law</h2>
<p>This Agreement is governed by the laws of the state in which the Premises is located. Any dispute arising under this Agreement shall be resolved in the appropriate courts of that jurisdiction.</p>

<h2>Article 16 — Electronic Signature</h2>
<p>This Agreement may be executed by electronic signature, which is legally binding to the same extent as a handwritten signature pursuant to the <strong>${eSignLaw}</strong>. Each party's electronic signature constitutes their original signature for all purposes.</p>

<h2>Article 17 — Entire Agreement</h2>
<p>This Agreement, together with any written addenda signed by both parties, constitutes the entire agreement between the parties and supersedes all prior oral or written agreements, understandings, or representations. It may only be modified by a written instrument signed by both Landlord and Tenant.</p>

<h2>Article 18 — Required Disclosures</h2>
${disclosures.map((d: string) => `<div class="disclosure">⚠️ ${d}</div>`).join('\n')}
<div class="disclosure">⚠️ Equal Housing Opportunity: This property is offered in compliance with all applicable federal, state, and local fair housing laws. Discrimination on the basis of any protected class is prohibited.</div>

<h2>Signatures</h2>

<p><strong>Tenant Signature:</strong></p>
<div class="sig-block">
  <div class="sig-name">${escHtml(app.tenant_signature || '—')}</div>
  <div class="sig-meta">
    ${tenantName} &nbsp;·&nbsp; Signed electronically on ${signedAt}<br>
    IP Address: ${escHtml(app.lease_ip_address || 'recorded')} &nbsp;·&nbsp; Application: ${escHtml(app.app_id)}
  </div>
</div>

${app.has_co_applicant && app.co_applicant_signature ? `
<p><strong>Co-Applicant Signature:</strong></p>
<div class="sig-block">
  <div class="sig-name">${escHtml(app.co_applicant_signature)}</div>
  <div class="sig-meta">
    ${coName || 'Co-Applicant'} &nbsp;·&nbsp; Signed electronically on ${app.co_applicant_signature_timestamp ? new Date(app.co_applicant_signature_timestamp).toLocaleString('en-US') : signedAt}<br>
    Application: ${escHtml(app.app_id)}
  </div>
</div>` : (app.has_co_applicant ? '<p style="color:#b45309"><em>Co-applicant signature pending.</em></p>' : '')}

<p><strong>Landlord:</strong></p>
<div class="sig-block">
  <div class="sig-name">${landlordName}</div>
  <div class="sig-meta">Executed by: Choice Properties Leasing System &nbsp;·&nbsp; ${today}</div>
</div>

<div class="footer">
  Choice Properties &nbsp;·&nbsp; Nationwide Rental Marketplace &nbsp;·&nbsp; Equal Housing Opportunity<br>
  Document Reference: ${escHtml(app.app_id)} &nbsp;·&nbsp; Generated: ${today}<br>
  This is a legally binding electronic lease agreement executed under applicable state and federal e-signature law.
</div>
</body>
</html>`
}
