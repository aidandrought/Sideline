// components/PlayerDetailModal.tsx
// Modal showing detailed player info and match stats

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { matchDetailService, PlayerDetail, PlayerMatchStats } from '../services/matchDetailService';

interface PlayerDetailModalProps {
  visible: boolean;
  onClose: () => void;
  playerId: number;
  playerName: string;
  fixtureId: number;
}

export default function PlayerDetailModal({
  visible,
  onClose,
  playerId,
  playerName,
  fixtureId
}: PlayerDetailModalProps) {
  const [playerDetail, setPlayerDetail] = useState<PlayerDetail | null>(null);
  const [matchStats, setMatchStats] = useState<PlayerMatchStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && playerId) {
      loadPlayerData();
    }
  }, [visible, playerId]);

  const loadPlayerData = async () => {
    setLoading(true);
    try {
      const [detail, stats] = await Promise.all([
        matchDetailService.getPlayerDetails(playerId),
        matchDetailService.getPlayerMatchStats(fixtureId, playerId)
      ]);
      
      setPlayerDetail(detail);
      setMatchStats(stats);
    } catch (error) {
      console.error('Error loading player data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Player Stats</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0066CC" />
                <Text style={styles.loadingText}>Loading player data...</Text>
              </View>
            ) : (
              <>
                {/* Player Profile */}
                <View style={styles.profileSection}>
                  {playerDetail?.photo ? (
                    <Image source={{ uri: playerDetail.photo }} style={styles.playerPhoto} />
                  ) : (
                    <View style={styles.playerPhotoPlaceholder}>
                      <Ionicons name="person" size={48} color="#666" />
                    </View>
                  )}

                  <Text style={styles.playerName}>{playerName}</Text>
                  <Text style={styles.playerPosition}>{playerDetail?.position || 'Player'}</Text>

                  {/* Basic Info */}
                  <View style={styles.basicInfoGrid}>
                    <View style={styles.infoCard}>
                      <Ionicons name="flag" size={20} color="#0066CC" />
                      <Text style={styles.infoLabel}>Nationality</Text>
                      <View style={styles.nationalityRow}>
                        {playerDetail?.nationalityFlag && (
                          <Image 
                            source={{ uri: playerDetail.nationalityFlag }} 
                            style={styles.flag}
                          />
                        )}
                        <Text style={styles.infoValue}>{playerDetail?.nationality || 'N/A'}</Text>
                      </View>
                    </View>

                    <View style={styles.infoCard}>
                      <Ionicons name="calendar" size={20} color="#0066CC" />
                      <Text style={styles.infoLabel}>Age</Text>
                      <Text style={styles.infoValue}>{playerDetail?.age || 'N/A'}</Text>
                    </View>

                    <View style={styles.infoCard}>
                      <Ionicons name="resize" size={20} color="#0066CC" />
                      <Text style={styles.infoLabel}>Height</Text>
                      <Text style={styles.infoValue}>{playerDetail?.height || 'N/A'}</Text>
                    </View>

                    <View style={styles.infoCard}>
                      <Ionicons name="barbell" size={20} color="#0066CC" />
                      <Text style={styles.infoLabel}>Weight</Text>
                      <Text style={styles.infoValue}>{playerDetail?.weight || 'N/A'}</Text>
                    </View>
                  </View>
                </View>

                {/* Match Statistics */}
                {matchStats ? (
                  <View style={styles.statsSection}>
                    <Text style={styles.sectionTitle}>Match Performance</Text>

                    {/* Rating */}
                    {matchStats.rating > 0 && (
                      <View style={styles.ratingCard}>
                        <Text style={styles.ratingLabel}>Match Rating</Text>
                        <Text style={styles.ratingValue}>{matchStats.rating.toFixed(1)}</Text>
                      </View>
                    )}

                    {/* Offensive Stats */}
                    <Text style={styles.statCategory}>⚽ Offensive</Text>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Goals</Text>
                      <Text style={styles.statValue}>{matchStats.goals}</Text>
                    </View>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Assists</Text>
                      <Text style={styles.statValue}>{matchStats.assists}</Text>
                    </View>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Shots (On Target)</Text>
                      <Text style={styles.statValue}>{matchStats.shotsOn}/{matchStats.shotsTotal}</Text>
                    </View>

                    {/* Passing Stats */}
                    <Text style={styles.statCategory}>📊 Passing</Text>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Pass Accuracy</Text>
                      <Text style={styles.statValue}>{matchStats.passAccuracy}%</Text>
                    </View>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Passes (Accurate/Total)</Text>
                      <Text style={styles.statValue}>{matchStats.passesAccurate}/{matchStats.passesTotal}</Text>
                    </View>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Key Passes</Text>
                      <Text style={styles.statValue}>{matchStats.keyPasses}</Text>
                    </View>

                    {/* Dribbling & Duels */}
                    <Text style={styles.statCategory}>🏃 Dribbling & Duels</Text>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Dribbles Completed</Text>
                      <Text style={styles.statValue}>{matchStats.dribblesSuccess}/{matchStats.dribblesAttempted}</Text>
                    </View>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Duels Won</Text>
                      <Text style={styles.statValue}>{matchStats.duelsWon}/{matchStats.duelsTotal}</Text>
                    </View>

                    {/* Defensive Stats */}
                    <Text style={styles.statCategory}>🛡️ Defensive</Text>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Tackles</Text>
                      <Text style={styles.statValue}>{matchStats.tackles}</Text>
                    </View>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Interceptions</Text>
                      <Text style={styles.statValue}>{matchStats.interceptions}</Text>
                    </View>

                    {/* Discipline */}
                    <Text style={styles.statCategory}>📋 Discipline</Text>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Fouls Drawn</Text>
                      <Text style={styles.statValue}>{matchStats.foulsDrawn}</Text>
                    </View>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Fouls Committed</Text>
                      <Text style={styles.statValue}>{matchStats.foulsCommitted}</Text>
                    </View>
                    {matchStats.yellowCards > 0 && (
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Yellow Cards</Text>
                        <Text style={[styles.statValue, { color: '#FFD60A' }]}>
                          {matchStats.yellowCards}
                        </Text>
                      </View>
                    )}
                    {matchStats.redCards > 0 && (
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Red Cards</Text>
                        <Text style={[styles.statValue, { color: '#FF3B30' }]}>
                          {matchStats.redCards}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.noStatsContainer}>
                    <Ionicons name="stats-chart-outline" size={48} color="#666" />
                    <Text style={styles.noStatsText}>No match stats available yet</Text>
                  </View>
                )}
              </>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#8E8E93',
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  playerPhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 15,
  },
  playerPhotoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  playerName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 5,
  },
  playerPosition: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
  },
  basicInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 20,
    gap: 12,
  },
  infoCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    width: '45%',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 8,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  nationalityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flag: {
    width: 20,
    height: 15,
  },
  statsSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 20,
  },
  ratingCard: {
    backgroundColor: '#0066CC',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  ratingValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFF',
  },
  statCategory: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFD60A',
    marginTop: 20,
    marginBottom: 10,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  statLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  noStatsContainer: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  noStatsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
  },
});