// services/chatService.ts
// Real chat service with match minute tracking
// ✅ Real live games = EMPTY chat (users communicate)
// ✅ Demo game only = Mock messages (for testing)
// ✅ Match minute shown next to username (67')

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  matchMinute?: number; // NEW: Game minute when message sent (e.g., 67)
  reactions: {
    [emoji: string]: {
      count: number;
      users: string[];
    };
  };
  replyTo?: {
    messageId: string;
    username: string;
    text: string;
  };
  type?: 'user' | 'system';
}

// Demo match ID (only this one gets mock messages)
const DEMO_MATCH_ID = 'demo_999999';

export class ChatService {
  private chatRooms: { [matchId: string]: ChatMessage[] } = {};

  subscribeToChat(matchId: string, callback: (messages: ChatMessage[]) => void) {
    // Initialize chat room if doesn't exist
    if (!this.chatRooms[matchId]) {
      // ONLY add mock messages for demo match
      if (matchId === DEMO_MATCH_ID) {
        console.log('📝 Loading DEMO chat with mock messages');
        this.chatRooms[matchId] = [
          {
            id: '1',
            userId: 'user1',
            username: 'SoccerFan92',
            text: 'Great match so far! 🔥',
            timestamp: Date.now() - 300000,
            matchMinute: 23, // Message sent at 23'
            reactions: {
              '❤️': { count: 5, users: ['user1', 'user2'] },
              '👍': { count: 3, users: ['user3'] }
            },
            type: 'user'
          },
          {
            id: '2',
            type: 'system',
            text: '⚽ GOAL! Salah scores!',
            timestamp: Date.now() - 180000,
            matchMinute: 23,
            userId: 'system',
            username: 'System',
            reactions: {}
          },
          {
            id: '3',
            userId: 'user2',
            username: 'FootballFanatic',
            text: 'What a goal! Best team in the world!',
            timestamp: Date.now() - 120000,
            matchMinute: 24,
            reactions: { '❤️': { count: 2, users: ['user2'] } },
            type: 'user'
          }
        ];
      } else {
        // Real live game - START WITH EMPTY CHAT
        console.log('🔥 Starting REAL chat for match:', matchId);
        this.chatRooms[matchId] = [];
      }
    }

    // Send current messages to callback
    callback(this.chatRooms[matchId]);

    // Return unsubscribe function
    return () => {
      console.log('👋 Unsubscribed from chat:', matchId);
    };
  }

  async sendMessage(
    matchId: string,
    userId: string,
    username: string,
    text: string,
    replyTo?: ChatMessage['replyTo'],
    matchMinute?: number // NEW: Pass current game minute
  ) {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      userId,
      username,
      text,
      timestamp: Date.now(),
      matchMinute, // Store the game minute (e.g., 67)
      reactions: {},
      replyTo,
      type: 'user'
    };

    if (!this.chatRooms[matchId]) {
      this.chatRooms[matchId] = [];
    }

    this.chatRooms[matchId].push(newMessage);
    console.log(`💬 Message sent at ${matchMinute}'`, newMessage);
    
    return newMessage;
  }

  async toggleReaction(matchId: string, messageId: string, emoji: string, userId: string) {
    if (!this.chatRooms[matchId]) return;

    const message = this.chatRooms[matchId].find(m => m.id === messageId);
    if (!message) return;

    if (!message.reactions[emoji]) {
      message.reactions[emoji] = { count: 0, users: [] };
    }

    const users = message.reactions[emoji].users;
    const hasReacted = users.includes(userId);

    if (hasReacted) {
      // Remove reaction
      message.reactions[emoji].users = users.filter(u => u !== userId);
      message.reactions[emoji].count = message.reactions[emoji].users.length;
      
      // Delete emoji key if count is 0
      if (message.reactions[emoji].count === 0) {
        delete message.reactions[emoji];
      }
    } else {
      // Add reaction
      message.reactions[emoji].users.push(userId);
      message.reactions[emoji].count = message.reactions[emoji].users.length;
    }
  }

  async sendSystemMessage(matchId: string, text: string, matchMinute?: number) {
    const systemMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'system',
      text,
      userId: 'system',
      username: 'System',
      timestamp: Date.now(),
      matchMinute,
      reactions: {}
    };

    if (!this.chatRooms[matchId]) {
      this.chatRooms[matchId] = [];
    }

    this.chatRooms[matchId].push(systemMessage);
    return systemMessage;
  }

  // Check if chat is open (45 min before to 10 min after game)
  isChatOpen(matchStartTime: number, matchStatus: string): boolean {
    const now = Date.now();
    const minutesBeforeStart = 45 * 60 * 1000; // 45 minutes in ms
    const minutesAfterEnd = 10 * 60 * 1000; // 10 minutes in ms
    
    // Chat opens 45 min before match
    const chatOpenTime = matchStartTime - minutesBeforeStart;
    
    // If match is finished, close chat 10 min after
    if (matchStatus === 'FT' || matchStatus === 'AET' || matchStatus === 'PEN') {
      const chatCloseTime = now - minutesAfterEnd;
      return now >= chatOpenTime && now <= chatCloseTime;
    }
    
    // If match is live or upcoming, chat is open
    return now >= chatOpenTime;
  }
}

export const chatService = new ChatService();