// services/chatService.ts
// Temporary chat service using local state
// Will integrate Firebase Realtime Database later

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
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

// Temporary in-memory storage
export class ChatService {
  // Move chatRooms inside the class
  private chatRooms: { [matchId: string]: ChatMessage[] } = {};

  subscribeToChat(matchId: string, callback: (messages: ChatMessage[]) => void) {
    if (!this.chatRooms[matchId]) {
      this.chatRooms[matchId] = [
        {
          id: '1',
          userId: 'user1',
          username: 'SoccerFan92',
          text: 'Great match so far! 🔥',
          timestamp: Date.now() - 300000,
          reactions: {
            '❤️': { count: 5, users: ['user1', 'user2'] },
            '👍': { count: 3, users: ['user3'] }
          },
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
          reactions: { '❤️': { count: 2, users: ['user2'] } },
          type: 'user'
        }
      ];
    }

    // Initial callback
    callback(this.chatRooms[matchId]);

    return () => {};
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

    if (!this.chatRooms[matchId]) {
      this.chatRooms[matchId] = [];
    }

    this.chatRooms[matchId].push(newMessage);
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
      message.reactions[emoji].users = users.filter(u => u !== userId);
    } else {
      message.reactions[emoji].users.push(userId);
    }

    message.reactions[emoji].count = message.reactions[emoji].users.length;
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

    if (!this.chatRooms[matchId]) {
      this.chatRooms[matchId] = [];
    }

    this.chatRooms[matchId].push(systemMessage);
    return systemMessage;
  }
}

export const chatService = new ChatService();