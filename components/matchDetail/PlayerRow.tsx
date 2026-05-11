import { StyleSheet, Text, View } from 'react-native';
import { PlayerDecor } from '../../services/eventsDecor';

type Props = {
  number?: number;
  name: string;
  decor?: PlayerDecor;
  relatedDecor?: PlayerDecor;
};

const renderDecorIcons = (decor?: PlayerDecor, compact = false) => {
  const goals = decor?.goals ?? 0;
  const assists = decor?.assists ?? 0;
  const yellow = decor?.yellow ?? 0;
  const red = decor?.red ?? 0;

  return (
    <View style={[styles.icons, compact && styles.iconsCompact]}>
      {goals > 0 && <Text style={[styles.icon, compact && styles.iconCompact]}>{'\u26BD'.repeat(Math.min(2, goals))}</Text>}
      {assists > 0 && <Text style={[styles.icon, compact && styles.iconCompact]}>{'\uD83D\uDC5F'.repeat(Math.min(2, assists))}</Text>}
      {yellow > 0 && <Text style={[styles.icon, compact && styles.iconCompact]}>{'\uD83D\uDFE8'}</Text>}
      {red > 0 && <Text style={[styles.icon, compact && styles.iconCompact]}>{'\uD83D\uDFE5'}</Text>}
    </View>
  );
};

export const PlayerRow = ({ number, name, decor, relatedDecor }: Props) => {
  const goals = decor?.goals ?? 0;
  const assists = decor?.assists ?? 0;
  const yellow = decor?.yellow ?? 0;
  const red = decor?.red ?? 0;
  const subOut = decor?.subbedOutMinute;
  const subIn = decor?.subbedInMinute;
  const replacedBy = decor?.replacedBy;
  const replacedWho = decor?.replacedWho;

  return (
    <View style={styles.rowWrap}>
      <View style={styles.row}>
        <Text style={styles.number}>{number ?? ''}</Text>
        <Text style={[styles.name, subOut && styles.nameSubbed]}>{name}</Text>
        {renderDecorIcons({ goals, assists, yellow, red, straightRed: 0, secondYellow: 0 })}
      </View>

      {(subOut || subIn) && (
        <View style={styles.subRow}>
          <Text style={styles.subIcon}>{'\u2195\uFE0F'}</Text>
          {subOut && replacedBy ? (
            <View style={styles.subContent}>
              <Text style={styles.subText}>
                <Text style={styles.subName}>{replacedBy.name || 'Sub'}</Text> ({replacedBy.minute})
              </Text>
              {renderDecorIcons(relatedDecor, true)}
            </View>
          ) : subIn && replacedWho ? (
            <View style={styles.subContent}>
              <Text style={styles.subText}>
                <Text style={styles.subName}>{replacedWho.name || 'Sub'}</Text> ({replacedWho.minute})
              </Text>
              {renderDecorIcons(relatedDecor, true)}
            </View>
          ) : (
            <Text style={styles.subText}>Substitution</Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  rowWrap: {
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  number: {
    width: 28,
    fontSize: 13,
    fontWeight: '700',
    color: '#E6E6E9',
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#4DA3FF',
  },
  nameSubbed: {
    color: '#8E8E93',
    textDecorationLine: 'line-through',
  },
  icons: {
    flexDirection: 'row',
    gap: 6,
  },
  iconsCompact: {
    gap: 4,
  },
  icon: {
    fontSize: 12,
  },
  iconCompact: {
    fontSize: 11,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginLeft: 38,
  },
  subContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  subIcon: {
    fontSize: 12,
  },
  subText: {
    fontSize: 12,
    color: '#A1A1A6',
  },
  subName: {
    color: '#4DA3FF',
    fontWeight: '700',
  },
});
