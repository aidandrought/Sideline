import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { UiEvent } from '../../services/eventsDecor';
import { teamPrimaryColor } from '../../services/teamTint';

type Props = {
  event: UiEvent;
  lightMode?: boolean;
};

const EventIcon = ({ event, lightMode = false }: Props) => {
  const teamColor = event.teamName ? teamPrimaryColor(event.teamName) : '#4DA3FF';
  const muted = lightMode ? '#6B7280' : '#8E8E93';
  const badgeStyle = [
    styles.iconBadge,
    {
      backgroundColor: lightMode ? 'rgba(17,24,39,0.06)' : 'rgba(255,255,255,0.06)',
      borderColor: lightMode ? 'rgba(17,24,39,0.08)' : 'rgba(255,255,255,0.08)',
    },
  ];
  const teamBadgeStyle = [
    styles.iconBadge,
    {
      backgroundColor: `${teamColor}20`,
      borderColor: `${teamColor}55`,
    },
  ];

  if (event.icon === 'goal') {
    return (
      <View style={teamBadgeStyle}>
        <Ionicons name="football" size={14} color="#4DA3FF" />
      </View>
    );
  }
  if (event.icon === 'corner') {
    return (
      <View style={teamBadgeStyle}>
        <Ionicons name="flag" size={13} color={teamColor} />
      </View>
    );
  }
  if (event.icon === 'shot') {
    return (
      <View style={teamBadgeStyle}>
        <Ionicons name="locate" size={13} color={teamColor} />
      </View>
    );
  }
  if (event.icon === 'save') {
    return (
      <View style={[styles.iconBadge, styles.saveBadge]}>
        <Ionicons name="hand-left" size={13} color="#34C759" />
      </View>
    );
  }
  if (event.icon === 'foul') {
    return (
      <View style={[styles.iconBadge, styles.foulBadge]}>
        <Ionicons name="warning" size={13} color="#F5C542" />
      </View>
    );
  }
  if (event.icon === 'penalty') {
    return (
      <View style={[styles.iconBadge, styles.penaltyBadge]}>
        <Ionicons name="radio-button-on" size={12} color="#FF8A65" />
      </View>
    );
  }
  if (event.icon === 'sub') {
    return (
      <View style={badgeStyle}>
        <Ionicons name="swap-horizontal" size={14} color="#4DA3FF" />
      </View>
    );
  }
  if (event.icon === 'var') {
    return (
      <View style={badgeStyle}>
        <Ionicons name="scan-circle" size={14} color={muted} />
      </View>
    );
  }
  if (event.icon === 'yellow') {
    return <View style={[styles.cardIcon, styles.yellowCard]} />;
  }
  if (event.icon === 'red') {
    return <View style={[styles.cardIcon, styles.redCard]} />;
  }
  return (
    <View style={badgeStyle}>
      <Ionicons name="ellipse" size={8} color={muted} />
    </View>
  );
};

export const PlayByPlayRow = ({ event, lightMode = false }: Props) => {
  const isSave = event.icon === 'save';
  return (
    <View style={[styles.row, isSave ? styles.rowCenter : styles.rowStart, lightMode ? styles.rowLight : styles.rowDark]}>
      <Text style={[styles.time, lightMode ? styles.timeLight : styles.timeDark]}>{event.time}</Text>
      <View style={[styles.iconWrap, isSave ? styles.iconWrapCenter : styles.iconWrapStart]}>
        <EventIcon event={event} lightMode={lightMode} />
      </View>
      <View style={styles.content}>
        {isSave && event.subText ? (
          <Text style={[styles.subText, lightMode ? styles.subTextLight : styles.subTextDark]}>{event.subText}</Text>
        ) : null}
        <Text style={[styles.text, isSave && styles.textSave, lightMode ? styles.textLight : styles.textDark]}>{event.text}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  rowStart: {
    alignItems: 'flex-start',
  },
  rowCenter: {
    alignItems: 'center',
  },
  rowDark: {
    borderBottomColor: '#232327',
  },
  rowLight: {
    borderBottomColor: '#E5E7EB',
  },
  time: {
    width: 50,
    fontSize: 12,
    fontWeight: '800',
    paddingTop: 1,
  },
  timeDark: {
    color: '#E6E6E9',
  },
  timeLight: {
    color: '#111827',
  },
  iconWrap: {
    width: 24,
    alignItems: 'center',
  },
  iconWrapStart: {
    justifyContent: 'flex-start',
    paddingTop: 1,
  },
  iconWrapCenter: {
    justifyContent: 'center',
  },
  iconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  saveBadge: {
    backgroundColor: 'rgba(52,199,89,0.14)',
    borderColor: 'rgba(52,199,89,0.35)',
  },
  foulBadge: {
    backgroundColor: 'rgba(245,197,66,0.14)',
    borderColor: 'rgba(245,197,66,0.35)',
  },
  penaltyBadge: {
    backgroundColor: 'rgba(255,138,101,0.14)',
    borderColor: 'rgba(255,138,101,0.35)',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  text: {
    fontSize: 13,
    lineHeight: 18,
  },
  textSave: {
    fontWeight: '700',
  },
  textDark: {
    color: '#D1D1D6',
  },
  textLight: {
    color: '#374151',
  },
  subText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 2,
  },
  subTextDark: {
    color: '#8E8E93',
  },
  subTextLight: {
    color: '#6B7280',
  },
  cardIcon: {
    width: 10,
    height: 14,
    borderRadius: 1.5,
  },
  yellowCard: {
    backgroundColor: '#F5C542',
  },
  redCard: {
    backgroundColor: '#FF453A',
  },
});
