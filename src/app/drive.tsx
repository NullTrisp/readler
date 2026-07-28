import { Redirect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, EmptyState, Loading, Screen, useReadlerTheme } from '@/components/readler-ui';
import { isGoogleConfigured, listDriveFolders, signInToDrive, type DriveFolder, type DriveUser } from '@/services/drive';
import { useApp } from '@/state/app-provider';

type Crumb = DriveFolder;

export default function DriveScreen() {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const { connectDrive, loading: importing, mode, ready } = useApp();
  const [user, setUser] = useState<DriveUser | null>(null);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: 'root', name: t('myDrive') }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = crumbs[crumbs.length - 1];

  const loadFolders = useCallback(async (folderId: string) => {
    setLoading(true);
    try { setFolders(await listDriveFolders(folderId)); }
    catch (caught) { setError(String(caught)); }
    finally { setLoading(false); }
  }, []);

  const signIn = async () => {
    setLoading(true); setError(null);
    try {
      const authenticated = await signInToDrive();
      setUser(authenticated);
      if (authenticated) await loadFolders('root');
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoading(false); }
  };

  const openFolder = async (folder: DriveFolder) => {
    setCrumbs((value) => [...value, folder]);
    await loadFolders(folder.id);
  };

  const goBack = async () => {
    const parent = crumbs[crumbs.length - 2];
    setCrumbs((value) => value.slice(0, -1));
    await loadFolders(parent.id);
  };

  if (!ready) return <Loading />;
  if (mode === 'local') return <Redirect href="/(tabs)/settings" />;
  if (!isGoogleConfigured()) return <Screen><EmptyState title={t('googleDrive')} body={t('googleNotConfigured')} /></Screen>;
  if (!user) return <Screen><EmptyState title={t('googleDrive')} body={error ?? t('googleOauthBody')} action={<Button loading={loading} onPress={() => void signIn()}>{t('connectDrive')}</Button>} /></Screen>;

  return <Screen>
    <View style={styles.header}>
      <AppText title>{current.name}</AppText>
      <AppText muted>{user.user.email}</AppText>
      {current.id !== 'root' && <Button loading={importing} onPress={() => void connectDrive(current, user.user.id)}>{t('chooseFolder')}</Button>}
      {crumbs.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => void goBack()}><AppText style={{ color: colors.primary, fontWeight: '700' }}>‹ {t('back')}</AppText></Pressable>}
      {error && <AppText style={{ color: colors.danger }}>{error}</AppText>}
    </View>
    {loading ? <Loading /> : <FlatList data={folders} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
      ListEmptyComponent={<EmptyState title={current.name} body={t('noFolders')} />}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={t('openFolderNamed', { name: item.name })} onPress={() => void openFolder(item)}><Card style={styles.folder}><AppText style={[styles.folderIcon, { color: colors.primary }]}>▰</AppText><AppText>{item.name}</AppText><AppText muted>›</AppText></Card></Pressable>} />}
  </Screen>;
}

const styles = StyleSheet.create({ header: { padding: 20, gap: 10 }, list: { padding: 20, gap: 10 }, folder: { flexDirection: 'row', alignItems: 'center', gap: 12 }, folderIcon: { fontSize: 22 } });
