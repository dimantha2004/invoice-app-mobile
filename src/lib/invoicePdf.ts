import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import type { Doc } from './api';
import { dmy, FREE_TYPES, freeNote, payLabel } from './format';
import { LOGO_URI } from './logo';
import { COMPANY } from './store';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

// Portable Bluetooth thermal printer roll. 80mm roll prints ~72mm wide; for a 58mm printer use 58 / 48.
const PAPER_MM = 80;
const PRINT_MM = 72;

/** Narrow, monochrome single-column layout for the thermal roll (overrides the A4 styles). */
const RECEIPT_CSS = `<style>
  @page{size:${PAPER_MM}mm auto;margin:0}
  body{width:${PRINT_MM}mm;margin:0 auto;padding:2mm 0;font-size:11px;color:#000}
  *{color:#000!important;background:none!important;border-color:#000!important}
  .top,.info,.co{display:block;text-align:center}.info{text-align:left}.co img{width:40px;height:40px}
  th,td{padding:2px 1px;font-size:10px}th:first-child,td:first-child{display:none}th{border-bottom:1px dashed}
  .tot{width:auto;margin:6px 0;border:0;border-top:1px dashed;border-radius:0;padding:4px 0}.bar{display:none}
  </style>`;

export function invoiceHtml(d: Doc) {
  const addr = esc(d.customerAddress || '-');
  const title = d.kind === 'order' ? 'Sales Order' : 'Invoice';
  const rows = (d.lines ?? []).filter(l => !l.free).map(l => `<tr><td>${esc(l.code)}</td><td>${esc(l.name)}</td><td>${l.qty} ${esc(l.unit)}</td><td class="r">${l.price.toFixed(2)}</td><td class="r">${l.amount.toFixed(2)}</td></tr>`).join('');
  return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:24px;font-size:13px}
  .t{color:#1D4FC4;text-align:center;font-weight:600;font-size:16px}
  .top{display:flex;justify-content:space-between;border-bottom:1.5px solid #1D4FC4;padding:12px 0}
  .co{display:flex;gap:16px}.co img{width:64px;height:64px}.blue{color:#1D4FC4;font-weight:700}
  .info{display:flex;justify-content:space-between;padding:14px 0}.info b{display:block;margin-top:4px}
  table{width:100%;border-collapse:collapse}th{background:#DCE8FD;text-align:left;padding:6px}td{padding:8px 6px}.r{text-align:right}
  .tot{margin:20px 0 20px auto;width:240px;border:1px solid #eee;border-radius:12px;padding:10px 14px}
  .tot div{display:flex;justify-content:space-between;padding:4px 0}.bar{height:28px;background:#0039B5;margin-top:40px}
  </style></head><body>
  <div class="t">${title}</div>
  <div class="top"><div class="co"><img src="${LOGO_URI}"/><div><div class="blue">${esc(COMPANY.name)}</div>${COMPANY.address.map(esc).join('<br/>')}</div></div>
  <div class="blue">${title} #${esc(d.number)}</div></div>
  <div class="info"><div><b>Customer Name</b>${esc(d.customerName)}<b>Billing Address:</b>${addr}</div>
  <div><b>Sales Representative</b>${esc(d.rep || '-')}<br/><b>Date:</b> ${dmy(d.date)}<br/><b>Due Date:</b> ${dmy(d.dueDate)}
  ${d.salesOrderNo ? `<br/><b>Sales Order:</b> ${esc(d.salesOrderNo)}` : ''}</div></div>
  <table><tr><th>Item #</th><th>Item</th><th>Qty</th><th class="r">Price</th><th class="r">Total</th></tr>${rows}</table>
  <div class="tot"><div><span>Sub Total</span><b>Rs.${d.subTotal.toFixed(2)}</b></div><div><span>Discount</span><b>${d.discount.toFixed(2)}</b></div>
  <div><span>Tax</span><b>${d.tax.toFixed(2)}</b></div><div class="blue"><span>Total</span><span>Rs.${d.net.toFixed(2)}</span></div>
  ${payLabel(d) ? `<div><span>Payment</span><b>${payLabel(d)}</b></div>` : ''}${d.credit ? `<div><span>Balance Due</span><b>Rs.${d.credit.toFixed(2)}</b></div>` : ''}</div>
  ${FREE_TYPES.map(([k, title]) => (freeNote(d.lines, k) ? `<p><b>${title} (not charged)</b>: ${esc(freeNote(d.lines, k))}</p>` : '')).join('')}
  ${d.notes ? `<p><b>Notes</b>: ${esc(d.notes)}</p>` : ''}<div class="bar"></div></body></html>`;
}

/** expo-print on web ignores `html` and prints the app screen, so print the invoice from a hidden iframe instead. */
function printHtmlOnWeb(html: string, title: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  frame.onload = () => { // fires after the logo image loads
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1000);
  };
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html.replace('<head>', `<head><title>${esc(title)}</title>`)); // title = default "Save as PDF" file name
  doc.close();
}

export async function printInvoice(d: Doc) {
  const html = invoiceHtml(d).replace('</head>', `${RECEIPT_CSS}</head>`);
  if (Platform.OS === 'web') return printHtmlOnWeb(html, d.number);
  try {
    // Android takes the roll size from the printer's print service; width (points) only applies on iOS.
    await Print.printAsync({ html, width: Math.round((PAPER_MM / 25.4) * 72), margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  } catch (e) {
    Alert.alert('Print failed', String(e));
  }
}

export async function downloadInvoice(d: Doc) {
  // ponytail: web "download" = browser print dialog → Save as PDF; add a PDF lib only if a one-click file is required.
  if (Platform.OS === 'web') return printHtmlOnWeb(invoiceHtml(d), d.number);
  try {
    const { uri } = await Print.printToFileAsync({ html: invoiceHtml(d) });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: d.number });
    else Alert.alert('Saved', uri);
  } catch (e) {
    Alert.alert('Download failed', String(e));
  }
}
