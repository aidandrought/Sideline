// services/chatService.ts
// Temporary chat service using local state
// Will integrate Firebase Realtime Database later

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  reactions: { [emoji: string]: number };
  replyTo?: {
    messageId: string;
    username: string;
    text: string;
  };
  type?: 'user' | 'system';
}

// Temporary in-memory storage
const chatRooms: { [matchId: string]: ChatMessage[] } = {};

class ChatService {
  subscribeToChat(matchId: string, callback: (messages: ChatMessage[]) => void) {
    // Initialize room if it doesn't exist with some mock messages
    if (!chatRooms[matchId]) {
      chatRooms[matchId] = [
        {
          id: '1',
          userId: 'user1',
          username: 'SoccerFan92',
          text: 'Great match so far! 🔥',
          timestamp: Date.now() - 300000,
          reactions: { '❤️': 5, '👍': 3 },
          type: 'user'
        },
        {
          id: '2',
          type: 'system',
          text: '⚽ GOAL! Match update!',
          timestamp: Date.now() - 180000,
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
          reactions: { '❤️': 2 },
          type: 'user'
        }
      ];
    }

    // Initial callback
    callback(chatRooms[matchId]);

    // Return unsubscribe function
    return () => {
      // Cleanup if needed
    };
  }

  async sendMessage(
    matchId: string,
    userId: string,
    username: string,
    text: string,
    replyTo?: ChatMessage['replyTo']
  ) {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      userId,
      username,
      text,
      timestamp: Date.now(),
      reactions: {},
      replyTo,
      type: 'user'
    };

    if (!chatRooms[matchId]) {
      chatRooms[matchId] = [];
    }

    chatRooms[matchId].push(newMessage);
    return newMessage;
  }

  async addReaction(matchId: string, messageId: string, emoji: string) {
    if (!chatRooms[matchId]) return;

    const message = chatRooms[matchId].find(m => m.id === messageId);
    if (message) {
      if (!message.reactions[emoji]) {
        message.reactions[emoji] = 0;
      }
      message.reactions[emoji]++;
    }
  }

  async sendSystemMessage(matchId: string, text: string, icon: string) {
    const systemMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'system',
      text,
      userId: 'system',
      username: 'System',
      timestamp: Date.now(),
      reactions: {}
    };

    if (!chatRooms[matchId]) {
      chatRooms[matchId] = [];
    }

    chatRooms[matchId].push(systemMessage);
    return systemMessage;
  }
}

export const chatService = new ChatService();