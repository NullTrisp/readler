import { SymbolView } from 'expo-symbols';
import { Redirect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, EmptyState, Screen, useReadlerTheme } from '@/components/readler-ui';
import { useNoticeTimeout } from '@/hooks/use-notice-timeout';
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
  useNoticeTimeout(error, setError);
  const current = crumbs[crumbs.length - 1];
  const buttonsDisabled = loading || importing;

  const loadFolders = useCallback(async (folderId: string, nextCrumbs?: Crumb[]) => {
    setLoading(true);
    setError(null);
    try {
      const nextFolders = await listDriveFolders(folderId);
      setFolders(nextFolders);
      if (nextCrumbs) setCrumbs(nextCrumbs);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const authenticated = await signInToDrive();
      setUser(authenticated);
      if (authenticated) await loadFolders('root');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };

  const openFolder = async (folder: DriveFolder) => {
    await loadFolders(folder.id, [...crumbs, folder]);
  };

  const goBack = async () => {
    const nextCrumbs = crumbs.slice(0, -1);
    await loadFolders(nextCrumbs[nextCrumbs.length - 1].id, nextCrumbs);
  };

  const chooseFolder = async () => {
    if (!user) return;
    setError(null);
    try {
      await connectDrive(current, user.user.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const loadingState = <View
    accessible
    accessibilityLabel={t('loading')}
    accessibilityRole="progressbar"
    accessibilityState={{ busy: true }}
    style={styles.loading}>
    <ActivityIndicator accessible={false} color={colors.primary} size="large" />
    <AppText muted>{t('loading')}</AppText>
  </View>;

  const errorNotice = error ? <View
    accessible
    accessibilityLiveRegion="assertive"
    accessibilityRole="alert"
    style={[styles.error, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
    <SymbolView
      accessible={false}
      name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
      size={22}
      style={styles.symbol}
      tintColor={colors.danger}
    />
    <AppText style={[styles.errorText, { color: colors.danger }]}>{error}</AppText>
  </View> : null;

  if (!ready) return <Screen>{loadingState}</Screen>;
  if (mode === 'local') return <Redirect href="/(tabs)/settings" />;
  if (!isGoogleConfigured()) return <Screen>
    <View style={styles.stateContent}>
      <EmptyState title={t('googleDrive')} body={t('googleNotConfigured')} />
    </View>
  </Screen>;
  if (!user) return <Screen>
    <View style={styles.stateContent}>
      <EmptyState
        title={t('googleDrive')}
        body={t('googleOauthBody')}
        action={<View style={styles.authActions}>
          {errorNotice}
          <Button loading={loading} onPress={() => void signIn()}>{t('connectDrive')}</Button>
        </View>}
      />
    </View>
  </Screen>;

  const path = crumbs.map((crumb) => crumb.name).join(' / ');

  return <Screen>
    <View style={styles.content}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <AppText muted style={styles.eyebrow}>{t('googleDrive')}</AppText>
          <AppText accessibilityRole="header" title numberOfLines={2}>{current.name}</AppText>
        </View>

        <Card style={styles.account}>
          <View style={[styles.accountIcon, { backgroundColor: colors.primaryContainer }]}>
            <SymbolView
              accessible={false}
              name={{ ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' }}
              size={26}
              style={styles.symbol}
              tintColor={colors.onPrimaryContainer}
            />
          </View>
          <View style={styles.accountCopy}>
            <AppText numberOfLines={1} style={styles.accountName}>{user.user.name ?? user.user.email}</AppText>
            {user.user.name ? <AppText muted numberOfLines={1}>{user.user.email}</AppText> : null}
          </View>
        </Card>

        <View
          accessible
          accessibilityLabel={`${t('folderPath')}: ${path}`}
          style={[styles.breadcrumb, { backgroundColor: colors.surfaceVariant }]}>
          <SymbolView
            accessible={false}
            name={{ ios: 'folder.fill', android: 'folder', web: 'folder' }}
            size={20}
            style={styles.symbol}
            tintColor={colors.primary}
          />
          <AppText muted numberOfLines={1} style={styles.breadcrumbText}>{path}</AppText>
        </View>

        <View style={styles.actions}>
          {crumbs.length > 1 ? <Pressable
            accessibilityLabel={t('goToParentFolder')}
            accessibilityRole="button"
            accessibilityState={{ busy: loading, disabled: buttonsDisabled }}
            disabled={buttonsDisabled}
            onPress={() => void goBack()}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.primaryContainer },
              pressed && !buttonsDisabled && styles.pressed,
              buttonsDisabled && styles.disabled,
            ]}>
            <SymbolView
              accessible={false}
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={20}
              style={styles.symbol}
              tintColor={colors.onPrimaryContainer}
            />
            <AppText style={[styles.backText, { color: colors.onPrimaryContainer }]}>{t('back')}</AppText>
          </Pressable> : null}
          {current.id !== 'root' ? <View style={styles.chooseAction}>
            <Button
              disabled={buttonsDisabled}
              icon={<SymbolView
                accessible={false}
                name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                size={20}
                style={styles.symbol}
                tintColor={buttonsDisabled ? colors.onDisabled : colors.onPrimary}
              />}
              loading={importing}
              onPress={() => void chooseFolder()}>
              {t('chooseFolder')}
            </Button>
          </View> : null}
        </View>

        {errorNotice}
      </View>

      {loading ? loadingState : <FlatList
        contentContainerStyle={styles.list}
        data={folders}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<View style={styles.emptyFolders}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primaryContainer }]}>
            <SymbolView
              accessible={false}
              name={{ ios: 'folder', android: 'folder_open', web: 'folder_open' }}
              size={34}
              style={styles.emptySymbol}
              tintColor={colors.onPrimaryContainer}
            />
          </View>
          <AppText title style={styles.emptyTitle}>{t('noFolders')}</AppText>
        </View>}
        renderItem={({ item }) => <Pressable
          accessibilityHint={t('openFolderHint')}
          accessibilityLabel={t('openFolderNamed', { name: item.name })}
          accessibilityRole="button"
          accessibilityState={{ disabled: buttonsDisabled }}
          disabled={buttonsDisabled}
          onPress={() => void openFolder(item)}
          style={({ pressed }) => [styles.folderPressable, pressed && !buttonsDisabled && styles.pressed, buttonsDisabled && styles.disabled]}>
          <Card style={styles.folder}>
            <View style={[styles.folderIcon, { backgroundColor: colors.primaryContainer }]}>
              <SymbolView
                accessible={false}
                name={{ ios: 'folder.fill', android: 'folder', web: 'folder' }}
                size={24}
                style={styles.symbol}
                tintColor={colors.onPrimaryContainer}
              />
            </View>
            <AppText numberOfLines={2} style={styles.folderName}>{item.name}</AppText>
            <SymbolView
              accessible={false}
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={22}
              style={styles.symbol}
              tintColor={colors.onSurfaceVariant}
            />
          </Card>
        </Pressable>}
      />}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  account: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 12 },
  accountCopy: { flex: 1, gap: 2, minWidth: 0 },
  accountIcon: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  accountName: { fontWeight: '700' },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  authActions: { alignSelf: 'center', gap: 12, maxWidth: 420, width: '100%' },
  backButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 46, minWidth: 44, paddingHorizontal: 14 },
  backText: { fontWeight: '700' },
  breadcrumb: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, minHeight: 44, paddingHorizontal: 12 },
  breadcrumbText: { flex: 1 },
  chooseAction: { marginLeft: 'auto', maxWidth: '100%' },
  content: { alignSelf: 'center', flex: 1, maxWidth: 800, width: '100%' },
  disabled: { opacity: 0.55 },
  emptyFolders: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 32 },
  emptyIcon: { alignItems: 'center', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  emptySymbol: { height: 34, width: 34 },
  emptyTitle: { textAlign: 'center' },
  error: { alignItems: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, minHeight: 44, padding: 12 },
  errorText: { flex: 1 },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, lineHeight: 18, textTransform: 'uppercase' },
  folder: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 64 },
  folderIcon: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  folderName: { flex: 1, fontWeight: '600' },
  folderPressable: { borderRadius: 18, minHeight: 64 },
  header: { gap: 16, paddingBottom: 16, paddingHorizontal: 20, paddingTop: 24 },
  list: { flexGrow: 1, gap: 10, paddingBottom: 24, paddingHorizontal: 20, paddingTop: 4 },
  loading: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  pressed: { opacity: 0.72 },
  stateContent: { alignSelf: 'center', flex: 1, maxWidth: 800, width: '100%' },
  symbol: { height: 26, width: 26 },
  titleGroup: { gap: 4 },
});
