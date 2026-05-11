import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PlayerDecor } from '../../services/eventsDecor';
import { teamPrimaryColor } from '../../services/teamTint';

type PitchPlayer = {
  id?: number;
  name: string;
  number?: number;
  grid?: string;
};

type Props = {
  players: PitchPlayer[];
  decorMap: Map<number, PlayerDecor>;
  teamName?: string;
};

type GridInfo = {
  row: number;
  col: number;
};
type OverlayCorner = 'TR' | 'TL' | 'BR' | 'BL';
const ASSIST_BOOT_ICON = require('../../assets/images/assist-boot.png');

const parseGrid = (grid?: string): GridInfo => {
  if (!grid || !grid.includes(':')) return { row: 1, col: 1 };
  const [rowStr, colStr] = grid.split(':');
  const row = Number(rowStr);
  const col = Number(colStr);
  return {
    row: Number.isFinite(row) && row > 0 ? row : 1,
    col: Number.isFinite(col) && col > 0 ? col : 1,
  };
};

const getRowLeftPercents = (count: number) => {
  if (count <= 0) return [];
  if (count === 1) return [50];
  const presets: Record<number, number[]> = {
    2: [34, 66],
    3: [24, 50, 76],
    4: [16, 38, 62, 84],
    5: [12, 31, 50, 69, 88],
  };
  if (presets[count]) return presets[count];
  const min = 10;
  const max = 90;
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + i * step);
};

const getRowTopPercents = (rowCount: number) => {
  if (rowCount <= 0) return [];
  if (rowCount === 1) return [52];
  const start = 86;
  const end = 14;
  const step = (start - end) / (rowCount - 1);
  return Array.from({ length: rowCount }, (_, index) => start - step * index);
};

export const LineupPitch = ({ players, decorMap, teamName }: Props) => {
  const { width } = useWindowDimensions();
  const compact = width <= 430;
  const jerseyColor = teamPrimaryColor(teamName);
  const positionedPlayers = useMemo(() => {
    const byRow = new Map<number, Array<{ player: PitchPlayer; col: number }>>();
    players.forEach((player) => {
      const { row, col } = parseGrid(player.grid);
      const current = byRow.get(row) || [];
      current.push({ player, col });
      byRow.set(row, current);
    });

    const orderedRows = Array.from(byRow.keys()).sort((a, b) => a - b);
    const rowTops = getRowTopPercents(orderedRows.length);

    return orderedRows.flatMap((row, rowIndex) => {
      const rowPlayers = (byRow.get(row) || []).slice().sort((a, b) => a.col - b.col);
      const lefts = getRowLeftPercents(rowPlayers.length);
      return rowPlayers.map((entry, idx) => ({
        player: entry.player,
        row,
        left: lefts[idx] ?? 50,
        top: rowTops[rowIndex] ?? 50,
      }));
    });
  }, [players]);

  const keeperRow = useMemo(() => {
    if (!positionedPlayers.length) return 1;
    return Math.min(...positionedPlayers.map((p) => p.row));
  }, [positionedPlayers]);

  return (
    <View style={styles.pitchWrap}>
      <View style={styles.pitch}>
        <View style={styles.pitchShadeTop} />
        <View style={styles.pitchShadeBottom} />
        <View style={styles.pitchStripeOne} />
        <View style={styles.pitchStripeTwo} />
        <View style={styles.topPenaltyBox} />
        <View style={styles.topGoalBox} />
        <View style={styles.bottomPenaltyBox} />
        <View style={styles.bottomGoalBox} />
        <View style={styles.pitchCenter} />
        <View style={styles.pitchCircle} />

        {positionedPlayers.map(({ player, left, top }, index) => {
          const decor = player.id ? decorMap.get(player.id) : undefined;
          const goals = decor?.goals ?? 0;
          const assists = decor?.assists ?? 0;
          const subCount = (decor?.subbedInMinute ? 1 : 0) + (decor?.subbedOutMinute ? 1 : 0);
          const yellow = decor?.yellow ?? 0;
          const red = decor?.red ?? 0;
          const straightRed = decor?.straightRed ?? Math.max(0, red - (decor?.secondYellow ?? 0));
          const secondYellow = decor?.secondYellow ?? 0;
          const isKeeper = parseGrid(player.grid).row === keeperRow;
          const getOverlayBase = (corner: OverlayCorner) => {
            const inset = compact ? 2 : 3;
            switch (corner) {
              case 'TR':
                return { top: inset, right: inset };
              case 'TL':
                return { top: inset, left: inset };
              case 'BR':
                return { bottom: inset, right: inset };
              case 'BL':
                return { bottom: inset, left: inset };
            }
          };
          const getOverlayDelta = (corner: OverlayCorner) => {
            const step = compact ? 5 : 6;
            switch (corner) {
              case 'TR':
                return { dx: -step, dy: 0 };
              case 'TL':
                return { dx: step, dy: 0 };
              case 'BR':
                return { dx: -step, dy: 0 };
              case 'BL':
                return { dx: step, dy: 0 };
            }
          };
          const renderEventStack = (
            count: number,
            corner: OverlayCorner,
            renderIcon: (i: number) => ReactNode,
            rotationDeg?: number,
          ) => {
            if (count <= 0) return null;
            const limited = Math.min(count, 3);
            const extra = count - limited;
            const base = getOverlayBase(corner);
            const { dx, dy } = getOverlayDelta(corner);
            return (
              <>
                {Array.from({ length: limited }).map((_, i) => (
                  <View
                    key={`${player.id ?? player.name}-${corner}-${i}`}
                    style={[
                      styles.overlayBadge,
                      compact && styles.overlayBadgeCompact,
                      base,
                      {
                        transform: [
                          { translateX: i * dx },
                          { translateY: i * dy },
                          ...(rotationDeg ? [{ rotate: `${rotationDeg}deg` as const }] : []),
                        ],
                      },
                    ]}
                  >
                    {renderIcon(i)}
                  </View>
                ))}
                {extra > 0 && (
                  <View
                    style={[
                      styles.overlayBadge,
                      compact && styles.overlayBadgeCompact,
                      base,
                      {
                        transform: [
                          { translateX: limited * dx },
                          { translateY: limited * dy },
                        ],
                      },
                    ]}
                  >
                    <Text style={styles.overlayPlus}>+{extra}</Text>
                  </View>
                )}
              </>
            );
          };
          const renderMixedCardStack = (yellowCount: number, redCount: number) => {
            const cards: Array<'yellow' | 'red'> = [];
            for (let i = 0; i < yellowCount; i += 1) cards.push('yellow');
            for (let i = 0; i < redCount; i += 1) cards.push('red');
            if (cards.length === 0) return null;
            const limited = cards.slice(0, 3);
            const extra = cards.length - limited.length;
            const base = {
              ...getOverlayBase('BL'),
              bottom: compact ? 8 : 9,
              left: compact ? 10 : 6,
            };
            const { dx, dy } = getOverlayDelta('BL');
            return (
              <>
                {limited.map((cardType, i) => (
                  <View
                    key={`${player.id ?? player.name}-card-${cardType}-${i}`}
                    style={[
                      styles.overlayBadge,
                      compact && styles.overlayBadgeCompact,
                      styles.cardBadge,
                      compact && styles.cardBadgeCompact,
                      base,
                      {
                        transform: [{ translateX: i * dx }, { translateY: i * dy }],
                      },
                    ]}
                  >
                    <View style={[styles.cardTileSmall, cardType === 'yellow' ? styles.yellowCard : styles.redCard]} />
                  </View>
                ))}
                {extra > 0 && (
                  <View
                    style={[
                      styles.overlayBadge,
                      compact && styles.overlayBadgeCompact,
                      base,
                      { transform: [{ translateX: limited.length * dx }, { translateY: limited.length * dy }] },
                    ]}
                  >
                    <Text style={styles.overlayPlus}>+{extra}</Text>
                  </View>
                )}
              </>
            );
          };

          let yellowForDisplay = yellow;
          let redForDisplay = red;
          if (straightRed > 0 && secondYellow === 0) {
            // Straight red replaces prior yellow display.
            yellowForDisplay = 0;
          }
          if (secondYellow > 0) {
            yellowForDisplay = Math.max(1, yellowForDisplay);
            redForDisplay = Math.max(1, redForDisplay);
          }

          return (
            <View
              key={`${player.id ?? player.name}-${index}`}
              style={[styles.playerWrap, compact && styles.playerWrapCompact, { left: `${left}%`, top: `${top}%` }]}
            >
            <View style={[styles.jerseyWrap, compact && styles.jerseyWrapCompact]}>
              {renderEventStack(
                assists,
                'TL',
                (i) => (
                  <Image
                    key={`a-${i}`}
                    source={ASSIST_BOOT_ICON}
                    style={compact ? styles.assistBootCompact : styles.assistBoot}
                    resizeMode="contain"
                  />
                ),
                -20,
              )}
              {renderEventStack(
                goals,
                'TR',
                (i) => <MaterialCommunityIcons key={`g-${i}`} name="soccer" size={compact ? 8 : 9} color="#1a1a1a" />,
              )}
              {renderEventStack(
                subCount,
                'BR',
                (i) => <MaterialCommunityIcons key={`s-${i}`} name="swap-vertical" size={compact ? 9 : 10} color="#111111" />,
              )}
              {renderMixedCardStack(yellowForDisplay, redForDisplay)}
              <MaterialCommunityIcons
                name="tshirt-crew"
                size={compact ? 44 : 50}
                color={isKeeper ? '#090909' : jerseyColor}
                style={styles.jerseyIcon}
              />
              <Text style={[styles.jerseyNumber, compact && styles.jerseyNumberCompact, { color: '#FFFFFF' }]}>
                {player.number ?? ''}
              </Text>
            </View>
            <Text style={[styles.playerName, compact && styles.playerNameCompact]} numberOfLines={2}>
              {player.name}
            </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  pitchWrap: {
    borderRadius: 16,
    overflow: 'visible',
  },
  pitch: {
    height: 392,
    borderRadius: 16,
    backgroundColor: '#1F8F2F',
    borderWidth: 2,
    borderColor: '#9FD77A',
    position: 'relative',
    overflow: 'visible',
  },
  pitchShadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  pitchShadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  pitchStripeOne: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '20%',
    height: '16%',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pitchStripeTwo: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '58%',
    height: '16%',
    backgroundColor: 'rgba(0,0,0,0.07)',
  },
  pitchCenter: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  pitchCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.24)',
    transform: [{ translateX: -36 }, { translateY: -36 }],
  },
  topPenaltyBox: {
    position: 'absolute',
    top: 14,
    left: '18%',
    width: '64%',
    height: 78,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  topGoalBox: {
    position: 'absolute',
    top: 14,
    left: '40%',
    width: '20%',
    height: 30,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  bottomPenaltyBox: {
    position: 'absolute',
    bottom: 14,
    left: '18%',
    width: '64%',
    height: 78,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  bottomGoalBox: {
    position: 'absolute',
    bottom: 14,
    left: '40%',
    width: '20%',
    height: 30,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  playerWrap: {
    position: 'absolute',
    width: 104,
    alignItems: 'center',
    transform: [{ translateX: -52 }, { translateY: -28 }],
    overflow: 'visible',
  },
  playerWrapCompact: {
    width: 92,
    transform: [{ translateX: -46 }, { translateY: -26 }],
  },
  jerseyWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
    shadowOpacity: 0,
    elevation: 0,
  },
  jerseyWrapCompact: {
    width: 46,
    height: 46,
  },
  jerseyIcon: {
    position: 'absolute',
  },
  jerseyNumber: {
    position: 'absolute',
    top: '36%',
    fontSize: 14,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  jerseyNumberCompact: {
    fontSize: 13,
  },
  playerName: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 10,
    fontWeight: '700',
    color: '#F3F4F6',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  playerNameCompact: {
    marginTop: 3,
    fontSize: 7,
    lineHeight: 8,
  },
  overlayBadge: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  overlayBadgeCompact: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  overlayPlus: {
    fontSize: 7,
    lineHeight: 8,
    fontWeight: '800',
    color: '#111111',
  },
  assistBoot: {
    width: 10,
    height: 10,
  },
  assistBootCompact: {
    width: 8,
    height: 8,
  },
  cardBadge: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
    width: 6,
    height: 10,
    borderRadius: 0,
  },
  cardBadgeCompact: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
    width: 5,
    height: 5.8,
    borderRadius: 0,
  },
  cardTileSmall: {
    width: 4.5,
    height: 8,
    borderRadius: 1,
  },
  yellowCard: {
    backgroundColor: '#FACC15',
  },
  redCard: {
    backgroundColor: '#DC2626',
  },
});
