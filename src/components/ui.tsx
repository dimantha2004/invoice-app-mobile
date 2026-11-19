import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dmy, fromIso, isoDay, lineTotal, rs, type Line } from '../lib/format';

export const C = {
  primary: '#0039B5',
  primaryDark: '#001E5C',
  blue: '#2E6BEF',
  text: '#111111',
  textBlue: '#1D4FC4',
  lightText: '#8FB0F2',
  muted: '#7A7A7A',
  placeholder: '#A5ADBD',
  inputBg: '#E3EEFD',
  inputBorder: '#9DB8F5',
  cardBorder: '#E4E7EE',
  danger: '#E5484D',
  success: '#1FA64A',
  warning: '#F5A623',
  white: '#FFFFFF',
};

export { Ionicons, MaterialCommunityIcons };

/** Dark status-bar text while the screen is focused (white-topped screens); light elsewhere. */
export function useDarkStatusBar() {
  useFocusEffect(useCallback(() => {
    setStatusBarStyle('dark');
    return () => setStatusBarStyle('light');
  }, []));
}

/* ---------- Layout ---------- */

export function Header({ title, back = true }: { title: string; back?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 14 }]}>
      {back && (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={12} style={{ marginRight: 20 }}>
          <Ionicons name="chevron-back" size={24} color={C.white} />
        </Pressable>
      )}
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

export type TabName = 'home' | 'invoices' | 'customers' | 'settings';
const TABS: { name: TabName; label: string; icon: (color: string) => ReactNode }[] = [
  { name: 'home', label: 'Home', icon: c => <Ionicons name="home" size={26} color={c} /> },
  { name: 'invoices', label: 'Invoices', icon: c => <MaterialCommunityIcons name="receipt-text-outline" size={28} color={c} /> },
  { name: 'customers', label: 'Customers', icon: c => <Ionicons name="person-outline" size={26} color={c} /> },
  { name: 'settings', label: 'Settings', icon: c => <Ionicons name="settings-outline" size={26} color={c} /> },
];

export function goTab(name: TabName) {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(`/${name}`);
}

export function TabBar({ active, onPress = goTab }: { active?: TabName; onPress?: (t: TabName) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.tabBar, { paddingBottom: insets.bottom + 6 }]}>
      {TABS.map(t => {
        const on = t.name === active;
        return (
          <Pressable key={t.name} style={s.tab} onPress={() => onPress(t.name)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <View style={on ? s.tabActive : s.tabInner}>
              {t.icon(on ? C.primary : C.white)}
              <Text style={[s.tabLabel, on && { color: C.primary, fontWeight: '700' }]}>{t.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Standard screen: blue header, scrolling body, optional sticky footer, bottom tabs. */
export function Screen({ title, tab, back = true, footer, children, contentStyle }: {
  title: string; tab?: TabName; back?: boolean; footer?: ReactNode; children: ReactNode; contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <Header title={title} back={back} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[s.body, contentStyle]} keyboardShouldPersistTaps="handled">
          {children}
          {footer}
        </ScrollView>
      </KeyboardAvoidingView>
      {tab !== undefined && <TabBar active={tab} />}
    </View>
  );
}

/* ---------- Inputs ---------- */

export function SearchBar({ value, onChangeText, placeholder, style }: {
  value: string; onChangeText: (t: string) => void; placeholder: string; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.search, style]}>
      <Ionicons name="search" size={22} color="#222" />
      <TextInput style={s.searchInput} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.muted} />
    </View>
  );
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={C.placeholder} {...props} style={[s.field, props.style]} />;
}

function FieldShell({ onPress, value, placeholder, right }: { onPress: () => void; value?: string; placeholder: string; right: ReactNode }) {
  return (
    <Pressable style={[s.field, s.fieldRow]} onPress={onPress} accessibilityRole="button" accessibilityLabel={placeholder}>
      <Text style={{ fontSize: 16, color: value ? C.text : C.placeholder, flex: 1 }} numberOfLines={1}>{value || placeholder}</Text>
      {right}
    </Pressable>
  );
}

export function SelectField({ placeholder, value, options, onChange }: {
  placeholder: string; value: string; options: { label: string; value: string }[] | string[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const opts = options.map(o => (typeof o === 'string' ? { label: o, value: o } : o));
  return (
    <>
      <FieldShell onPress={() => setOpen(true)} value={opts.find(o => o.value === value)?.label} placeholder={placeholder}
        right={<Ionicons name="chevron-down" size={22} color="#111" />} />
      <Sheet visible={open} title={placeholder} onClose={() => setOpen(false)}>
        {opts.map(o => (
          <Pressable key={o.value} style={s.option} onPress={() => { onChange(o.value); setOpen(false); }}>
            <Text style={[{ fontSize: 16, color: C.text }, o.value === value && { color: C.textBlue, fontWeight: '700' }]}>{o.label}</Text>
            {o.value === value && <Ionicons name="checkmark" size={20} color={C.textBlue} />}
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}

/** value is an ISO day string (yyyy-mm-dd) or '' */
export function DateField({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (iso: string) => void }) {
  const [iosOpen, setIosOpen] = useState(false);
  const current = value ? fromIso(value) : new Date();
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: current, mode: 'date', onChange: (e, d) => { if (e.type === 'set' && d) onChange(isoDay(d)); } });
    } else setIosOpen(true);
  };
  // DateTimePicker has no web implementation: overlay an invisible native date input on the field.
  if (Platform.OS === 'web') return (
    <View>
      <FieldShell onPress={() => {}} value={value ? dmy(value) : ''} placeholder={placeholder}
        right={<Ionicons name="calendar-outline" size={22} color="#111" />} />
      <input type="date" value={value} aria-label={placeholder}
        onChange={e => { if (e.target.value) onChange(e.target.value); }}
        onClick={e => e.currentTarget.showPicker?.()}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 0 }} />
    </View>
  );
  return (
    <>
      <FieldShell onPress={open} value={value ? dmy(value) : ''} placeholder={placeholder}
        right={<Ionicons name="calendar-outline" size={22} color="#111" />} />
      {Platform.OS !== 'android' && (
        <Sheet visible={iosOpen} title={placeholder} onClose={() => setIosOpen(false)}>
          <DateTimePicker value={current} mode="date" display="inline" themeVariant="light" onChange={(_, d) => { if (d) { onChange(isoDay(d)); setIosOpen(false); } }} />
        </Sheet>
      )}
    </>
  );
}

/* ---------- Buttons ---------- */

export function Btn({ title, onPress, variant = 'primary', icon, style, small }: {
  title: string; onPress: () => void; variant?: 'primary' | 'outline'; icon?: ReactNode; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [s.btn, small && s.btnSmall, primary ? s.btnPrimary : s.btnOutline, pressed && { opacity: 0.8 }, style]}>
      {icon}
      <Text style={[s.btnText, { color: primary ? C.white : C.textBlue }, small && { fontSize: 16 }]}>{title}</Text>
    </Pressable>
  );
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 16, marginTop: 24 }}>{children}</View>;
}

export function AddLink({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.addLink} accessibilityRole="button">
      <Ionicons name="add-circle-outline" size={24} color={C.textBlue} />
      <Text style={s.addLinkText}>{title}</Text>
    </Pressable>
  );
}

/* ---------- Overlays ---------- */

export function Sheet({ visible, title, onClose, children, footer }: {
  visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={s.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16, marginTop: insets.top + 60 }]}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={{ position: 'absolute', right: 0 }} accessibilityLabel="Close">
              <Ionicons name="close" size={30} color="#111" />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>{children}</ScrollView>
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Confirm({ visible, message, onNo, onYes }: { visible: boolean; message: string; onNo: () => void; onYes: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNo} statusBarTranslucent>
      <View style={s.dialogOverlay}>
        <View style={s.dialog}>
          <Text style={{ fontSize: 17, color: C.text, textAlign: 'center' }}>{message}</Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 22 }}>
            <Btn title="No" variant="outline" onPress={onNo} small style={{ width: 130, borderRadius: 10 }} />
            <Btn title="Yes" onPress={onYes} small style={{ width: 130, borderRadius: 10 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- Invoice pieces ---------- */

/** `free` (a title such as "Free Samples") lists free issues: same rows, but no prices or amounts. */
export function ItemsBox({ lines, onRemove, free }: { lines: Line[]; onRemove: (productId: number) => void; free?: string }) {
  const [pending, setPending] = useState<number | null>(null);
  return (
    <>
      <View style={s.itemsHead}>
        <Text style={s.itemsHeadText}>{free ?? 'Items'} ({lines.length})</Text>
        <Text style={[s.itemsHeadText, { marginRight: 56 }]}>{free ? 'Not charged' : 'Amount'}</Text>
      </View>
      <View style={s.itemsBox}>
        {lines.length === 0 ? (
          <Text style={{ textAlign: 'center', color: C.muted, paddingVertical: 20 }}>{free ? `No ${free.toLowerCase()} added.` : 'You don’t have added items.'}</Text>
        ) : lines.map((l, i) => (
          <View key={l.productId} style={[s.lineRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.inputBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 19, color: C.textBlue }}>{l.name}</Text>
              <Text style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{free ? `Qty ${l.qty} ${l.unit}` : `Qty ${l.qty} x Rs.${l.price}`}</Text>
            </View>
            <Text style={{ fontSize: 19, color: free ? C.success : C.text }}>{free ? 'Free' : rs(lineTotal(l))}</Text>
            <Pressable onPress={() => setPending(l.productId)} hitSlop={10} style={{ marginLeft: 16 }} accessibilityLabel={`Delete ${l.name}`}>
              <Ionicons name="trash-outline" size={22} color={C.danger} />
            </Pressable>
          </View>
        ))}
      </View>
      <Confirm visible={pending !== null} message="Are you sure you want to delete this item?"
        onNo={() => setPending(null)} onYes={() => { onRemove(pending!); setPending(null); }} />
    </>
  );
}

/** Row whose value can be edited inline (discount / tax). */
function NumberCell({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  return (
    <TextInput value={text} placeholder="0" placeholderTextColor={C.text} keyboardType="numeric"
      onChangeText={t => { const clean = t.replace(/[^0-9.]/g, ''); setText(clean); onChange(parseFloat(clean) || 0); }}
      style={s.numberCell} />
  );
}

export type TotalRow = { label: string; value?: string; edit?: { value: number; onChange: (n: number) => void } };

export function TotalsCard({ rows, net }: { rows: TotalRow[]; net: string }) {
  return (
    <View style={[s.card, { paddingVertical: 8 }]}>
      {rows.map(r => (
        <View key={r.label} style={s.totalRow}>
          <Text style={{ fontSize: 17, color: C.text }}>{r.label}</Text>
          {r.edit ? <NumberCell {...r.edit} /> : <Text style={{ fontSize: 17, fontWeight: '700', color: C.text }}>{r.value}</Text>}
        </View>
      ))}
      <View style={[s.totalRow, { borderTopWidth: 1, borderTopColor: C.cardBorder }]}>
        <Text style={s.netText}>Net Total</Text>
        <Text style={s.netText}>{net}</Text>
      </View>
    </View>
  );
}

export function NotesBox({ value, onChangeText }: { value: string; onChangeText: (t: string) => void }) {
  return (
    <TextInput style={[s.card, s.notes]} value={value} onChangeText={onChangeText} placeholder="Add Notes"
      placeholderTextColor={C.muted} multiline textAlignVertical="top" />
  );
}

export const s = StyleSheet.create({
  header: { backgroundColor: C.primary, paddingHorizontal: 20, paddingBottom: 26, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: C.white, fontSize: 24, fontWeight: '700', flex: 1 },
  body: { padding: 16, paddingBottom: 32, gap: 12 },
  tabBar: { backgroundColor: C.primary, flexDirection: 'row', paddingTop: 10 },
  tab: { flex: 1, alignItems: 'center' },
  tabInner: { alignItems: 'center', justifyContent: 'center', height: 60 },
  tabActive: {
    alignItems: 'center', justifyContent: 'center', width: 88, height: 88, borderRadius: 44, backgroundColor: C.white,
    marginTop: -24, marginBottom: -4, shadowColor: '#fff', shadowOpacity: 0.9, shadowRadius: 10, elevation: 8,
  },
  tabLabel: { color: '#DCE6FF', fontSize: 13, marginTop: 4 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCE8FD', borderRadius: 14, height: 56, paddingHorizontal: 18, gap: 14 },
  searchInput: { flex: 1, fontSize: 17, color: C.text },
  field: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.inputBorder, borderRadius: 12, height: 56, paddingHorizontal: 16, fontSize: 16, color: C.text },
  fieldRow: { flexDirection: 'row', alignItems: 'center' },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  // Longhands, not `flex`: on web `flex: 0` becomes `0 1 0%` and collapses the button to zero height.
  btn: { flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  btnSmall: { flexGrow: 0, flexBasis: 'auto', height: 46 },
  btnPrimary: { backgroundColor: C.primary },
  btnOutline: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.textBlue },
  btnText: { fontSize: 18, fontWeight: '600' },
  addLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  addLinkText: { color: C.textBlue, fontSize: 18, fontWeight: '700' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 20, maxHeight: '100%', flexShrink: 1 },
  sheetHead: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '500', color: C.text },
  dialogOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 28 },
  dialog: { backgroundColor: C.white, borderRadius: 14, paddingVertical: 36, paddingHorizontal: 20, alignItems: 'center' },
  itemsHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, marginTop: 16 },
  itemsHeadText: { fontSize: 20, fontWeight: '500', color: C.text },
  itemsBox: { borderWidth: 1, borderColor: C.inputBorder, borderRadius: 10, overflow: 'hidden' },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12 },
  card: {
    backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 24,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  numberCell: { fontSize: 17, fontWeight: '700', color: C.text, textAlign: 'right', minWidth: 80, padding: 0 },
  netText: { fontSize: 17, fontWeight: '700', color: C.textBlue },
  notes: { minHeight: 110, paddingTop: 14, fontSize: 16, color: C.text },
});
