import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { api, type Doc } from '../lib/api';
import type { Payment } from '../lib/format';
import { downloadInvoice, printInvoice } from '../lib/invoicePdf';
import { PaymentSheet } from './sheets';
import { Btn, C, Ionicons, MaterialCommunityIcons } from './ui';

/** Download / Print, "Pay" for pending invoices, plus "Add New Invoice" (invoices) or "Convert to Invoice" (open orders & drafts). */
export function InvoiceActions({ doc, onChanged }: { doc: Doc; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const canConvert = doc.kind === 'order' && doc.status !== 'paid';
  const due = doc.kind === 'invoice' && doc.status === 'pending' ? doc.credit ?? 0 : 0;

  const [paying, setPaying] = useState(false);

  // Choosing the payment is the confirmation: closing the sheet cancels the conversion.
  const convert = async (payment: Payment) => {
    setPaying(false);
    setBusy(true);
    try {
      const inv = await api<Doc>(`/orders/${doc.id}/invoice`, { method: 'POST', body: { payment } });
      router.replace({ pathname: '/confirmation', params: { id: inv.id, kind: 'invoice' } });
    } catch (e) {
      Alert.alert('Could not create invoice', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pay = async (payment: Payment) => {
    setPaying(false);
    setBusy(true);
    try {
      const inv = await api<Doc>(`/invoices/${encodeURIComponent(doc.id)}/pay`, { method: 'POST', body: { payment } });
      onChanged();
      Alert.alert('Payment saved', inv.status === 'paid' ? `Invoice ${inv.number} is now Paid.` : `Rs. ${(inv.credit ?? 0).toFixed(2)} is still due on invoice ${inv.number}.`);
    } catch (e) {
      Alert.alert('Could not save payment', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 20, marginTop: 24 }}>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Btn title="Download" variant="outline" onPress={() => downloadInvoice(doc)} icon={<MaterialCommunityIcons name="download" size={26} color={C.textBlue} />} />
        <Btn title="Print" variant="outline" onPress={() => printInvoice(doc)} icon={<Ionicons name="print" size={26} color={C.textBlue} />} />
      </View>
      {due > 0 && <Btn title={busy ? 'Saving…' : `Pay Rs. ${due.toFixed(2)}`} onPress={busy ? () => {} : () => setPaying(true)} style={{ flexGrow: 0, flexBasis: 'auto' }} />}
      {canConvert
        ? <Btn title={busy ? 'Creating…' : 'Convert to Invoice'} onPress={busy ? () => {} : () => setPaying(true)} style={{ flexGrow: 0, flexBasis: 'auto' }} />
        :<Btn title="Add New Invoice" onPress={() => router.replace('/invoice-form')} style={{ flexGrow: 0, flexBasis: 'auto' }} />}
      <PaymentSheet visible={paying} net={due || doc.net} settle={due > 0} onClose={() => setPaying(false)} onConfirm={due > 0 ? pay : convert} />
    </View>
  );
}
