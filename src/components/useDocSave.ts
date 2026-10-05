import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { submitDoc, type DocInput } from '../lib/api';
import { goTab } from './ui';

/** Shared save for New Invoice / Invoice Items List: drafts go home, everything else to the confirmation screen. */
export function useDocSave() {
  const [saving, setSaving] = useState(false);
  const save = async (target: 'invoice' | 'order' | 'draft', body: DocInput) => {
    if (saving) return;
    setSaving(true);
    try {
      const doc = await submitDoc(target, body);
      if (target === 'draft') {
        Alert.alert('Draft saved', `Saved as ${doc.number}. Find it under Orders / Draft.`);
        goTab('home');
      } else router.replace({ pathname: '/confirmation', params: { id: doc.id, kind: doc.kind } });
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}
