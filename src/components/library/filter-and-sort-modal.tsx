import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { sortLabel, type MetadataFilter } from '@/components/library/library-screen';
import { AppText, Button, useReadlerTheme } from '@/components/readler-ui';
import type { ReadingStatus } from '@/domain/models';
import type { LibrarySort } from '@/utils/library-filter';

type IconName = SymbolViewProps['name'];

export function FilterAndSortModal({
  visible,
  status,
  series,
  language,
  sort,
  seriesOptions,
  languageOptions,
  onStatusChange,
  onSeriesChange,
  onLanguageChange,
  onSortChange,
  onReset,
  onClose,
}: {
  visible: boolean;
  status: ReadingStatus | 'all';
  series: MetadataFilter;
  language: MetadataFilter;
  sort: LibrarySort;
  seriesOptions: string[];
  languageOptions: string[];
  onStatusChange(value: ReadingStatus | 'all'): void;
  onSeriesChange(value: MetadataFilter): void;
  onLanguageChange(value: MetadataFilter): void;
  onSortChange(value: LibrarySort): void;
  onReset(): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const colors = useReadlerTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const sortOptions: LibrarySort[] = ['title', 'author', 'series', 'modified', 'progress'];

  return <Modal
    visible={visible}
    transparent
    animationType="none"
    onRequestClose={onClose}>
    <View style={[styles.modalRoot, wide && styles.modalRootWide]}>
      <Pressable accessible={false} onPress={onClose} style={StyleSheet.absoluteFill} />
      <View
        accessibilityViewIsModal
        style={[
          styles.filterPanel,
          wide && styles.filterPanelWide,
          { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
        ]}>
        <View style={styles.panelHeader}>
          <AppText title>{t('filterAndSort')}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('closeFilters')}
            onPress={onClose}
            style={styles.iconButton}>
            <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={colors.onSurface} size={20} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
          <FilterSection title={t('sortBy')}>
            {sortOptions.map((value) => <ChoiceChip
              key={value}
              active={sort === value}
              label={sortLabel(value, t)}
              onPress={() => onSortChange(value)}
            />)}
          </FilterSection>
          <FilterSection title={t('readingStatus')}>
            {(['all', 'unread', 'reading', 'finished'] as const).map((value) => <ChoiceChip
              key={value}
              active={status === value}
              label={value === 'all' ? t('all') : t(value)}
              onPress={() => onStatusChange(value)}
            />)}
          </FilterSection>
          {seriesOptions.length ? <FilterSection title={t('series')}>
            <ChoiceChip active={series === 'all'} label={t('all')} onPress={() => onSeriesChange('all')} />
            {seriesOptions.map((value) => <ChoiceChip
              key={value}
              active={series === value}
              label={value}
              onPress={() => onSeriesChange(value)}
            />)}
          </FilterSection> : null}
          {languageOptions.length ? <FilterSection title={t('language')}>
            <ChoiceChip active={language === 'all'} label={t('all')} onPress={() => onLanguageChange('all')} />
            {languageOptions.map((value) => <ChoiceChip
              key={value}
              active={language === value}
              label={displayLanguage(value)}
              onPress={() => onLanguageChange(value)}
            />)}
          </FilterSection> : null}
        </ScrollView>
        <View style={styles.panelActions}>
          <Button secondary onPress={onReset}>{t('resetFilters')}</Button>
          <Button onPress={onClose}>{t('done')}</Button>
        </View>
      </View>
    </View>
  </Modal>;
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.filterSection}>
    <AppText style={styles.filterTitle}>{title}</AppText>
    <View style={styles.filterChoices}>{children}</View>
  </View>;
}

function ChoiceChip({ active, label, onPress }: { active: boolean; label: string; onPress(): void }) {
  const colors = useReadlerTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={({ pressed }) => [
      styles.choiceChip,
      {
        backgroundColor: active ? colors.primaryContainer : colors.surfaceVariant,
        borderColor: pressed || active ? colors.outline : colors.outlineVariant,
      },
    ]}>
    {active ? <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color={colors.onPrimaryContainer} size={16} /> : null}
    <AppText style={{ color: active ? colors.onPrimaryContainer : colors.onSurfaceVariant, fontWeight: active ? '700' : '600' }}>
      {label}
    </AppText>
  </Pressable>;
}

function Icon({ name, color, size }: { name: IconName; color: string; size: number }) {
  return <SymbolView name={name} tintColor={color} size={size} style={{ width: size, height: size }} />;
}

function displayLanguage(value: string) {
  return value.length <= 3 ? value.toLocaleUpperCase() : value;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  modalRootWide: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  filterPanel: {
    maxHeight: '88%',
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
  },
  filterPanelWide: { width: '100%', maxWidth: 640, borderRadius: 24 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 2 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  panelContent: { paddingVertical: 12, gap: 22 },
  filterSection: { gap: 9 },
  filterTitle: { fontWeight: '700' },
  filterChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  panelActions: { gap: 10, paddingTop: 12 },
});
