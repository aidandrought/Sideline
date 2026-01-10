// services/newsApi.ts
// Soccer/Football News API - Filtered for American/English/Spanish outlets only

import { API_CONFIG } from '../constants/config';

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  content: string;
  imageUrl?: string;
  source: string;
  author?: string;
  publishedAt: string;
  url: string;
  category: 'soccer' | 'general';
}

class NewsAPI {
  private baseURL = 'https://newsapi.org/v2';

  // ALLOWED sources - American, English, Spanish outlets only
  private allowedSources = [
    // American outlets
    'espn', 'espn.com', 'espn fc', 'fox sports', 'cbs sports', 'nbc sports',
    'the athletic', 'bleacher report', 'sports illustrated', 'yahoo sports',
    'usa today', 'new york times', 'washington post', 'la times', 'mlssoccer.com',
    
    // English/UK outlets  
    'bbc', 'bbc sport', 'bbc.com', 'sky sports', 'sky news', 'the guardian',
    'the telegraph', 'daily mail', 'mirror', 'the sun', 'the times',
    'the independent', 'evening standard', 'goal.com', 'football365',
    'talksport', 'fourfourtwo', '90min', 'the athletic uk',
    
    // Spanish outlets
    'marca', 'as', 'mundo deportivo', 'sport', 'el pais', 'el mundo',
    'diario as', 'cadena ser', 'cope', 'la vanguardia'
  ];

  // BLOCKED sources - Filter out completely
  private blockedSources = [
    // Indian outlets
    'times of india', 'hindustan times', 'ndtv', 'india today', 'the hindu',
    'indian express', 'economic times', 'zee news', 'news18', 'firstpost',
    'sportskeeda', 'khel now', 'india.com', 'dnaindia', 'deccan herald',
    'the quint', 'scroll.in', 'livemint', 'mid-day', 'dna india',
    
    // Other non-target regions
    'goal.com/en-in', 'india', '.in'
  ];

  // Keywords to EXCLUDE (American football, etc.)
  private excludedKeywords = [
    'nfl', 'nba', 'mlb', 'nhl', 'ncaa', 'super bowl', 'quarterback', 'touchdown',
    'basketball', 'baseball', 'hockey', 'american football', 'patriots', 'cowboys',
    'lakers', 'yankees', 'bulls', 'knicks', 'raiders', 'ipl', 'cricket'
  ];

  // Soccer-specific keywords to INCLUDE
  private soccerKeywords = [
    'soccer', 'football', 'premier league', 'la liga', 'serie a', 'bundesliga',
    'champions league', 'europa league', 'world cup', 'euros', 'fifa', 'uefa',
    'messi', 'ronaldo', 'haaland', 'mbappé', 'neymar', 'salah', 'benzema',
    'real madrid', 'barcelona', 'manchester', 'liverpool', 'chelsea', 'arsenal',
    'bayern', 'psg', 'juventus', 'inter', 'milan', 'atletico', 'tottenham',
    'goal', 'penalty', 'striker', 'midfielder', 'goalkeeper', 'transfer window',
    'el clasico', 'derby', 'ucl', 'epl', 'mls'
  ];

  async getSoccerNews(): Promise<NewsArticle[]> {
    try {
      // Multiple queries for better soccer coverage
      const queries = [
        '(soccer OR "premier league" OR "champions league") AND (goal OR match OR transfer)',
        '(football AND NOT "american football") AND (ronaldo OR messi OR haaland)',
        '"la liga" OR "serie a" OR bundesliga OR "ligue 1"',
        '("real madrid" OR barcelona OR liverpool OR "manchester city")'
      ];

      const allArticles: any[] = [];

      for (const query of queries) {
        try {
          const response = await fetch(
            `${this.baseURL}/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=15&apiKey=${API_CONFIG.NEWS_API_KEY}`
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data.articles) {
              allArticles.push(...data.articles);
            }
          }
        } catch (err) {
          console.log('Query failed, continuing...');
        }
      }

      if (allArticles.length > 0) {
        // Filter for soccer only AND allowed sources
        const filtered = this.filterSoccerAndSources(allArticles);
        const formatted = this.formatArticles(filtered);
        
        // Remove duplicates by URL
        const unique = this.removeDuplicates(formatted);
        
        return unique.slice(0, 20); // Top 20 unique articles
      }
    } catch (error) {
      console.log('Using mock soccer news data');
    }

    return this.getMockNews();
  }

  async searchNews(query: string): Promise<NewsArticle[]> {
    try {
      // Add soccer context to search
      const soccerQuery = `${query} AND (soccer OR football)`;
      
      const response = await fetch(
        `${this.baseURL}/everything?q=${encodeURIComponent(soccerQuery)}&language=en&sortBy=relevancy&apiKey=${API_CONFIG.NEWS_API_KEY}`
      );
      
      if (response.ok) {
        const data = await response.json();
        const filtered = this.filterSoccerAndSources(data.articles || []);
        return this.formatArticles(filtered);
      }
    } catch (error) {
      console.error('Error searching news:', error);
    }

    const mockNews = this.getMockNews();
    return mockNews.filter(article =>
      article.title.toLowerCase().includes(query.toLowerCase()) ||
      article.description.toLowerCase().includes(query.toLowerCase())
    );
  }

  private filterSoccerAndSources(articles: any[]): any[] {
    return articles.filter(article => {
      const title = article.title?.toLowerCase() || '';
      const description = article.description?.toLowerCase() || '';
      const sourceName = article.source?.name?.toLowerCase() || '';
      const sourceId = article.source?.id?.toLowerCase() || '';
      const url = article.url?.toLowerCase() || '';
      const combined = `${title} ${description}`;

      // Step 1: Check if source is BLOCKED
      const isBlocked = this.blockedSources.some(blocked => 
        sourceName.includes(blocked.toLowerCase()) || 
        sourceId.includes(blocked.toLowerCase()) ||
        url.includes(blocked.toLowerCase())
      );
      
      if (isBlocked) {
        console.log(`Blocked source: ${sourceName}`);
        return false;
      }

      // Step 2: Prefer allowed sources (but don't require them for quality content)
      const isAllowedSource = this.allowedSources.some(allowed =>
        sourceName.includes(allowed.toLowerCase()) ||
        sourceId.includes(allowed.toLowerCase())
      );

      // Step 3: Exclude non-soccer sports
      const hasExcludedKeyword = this.excludedKeywords.some(keyword =>
        combined.includes(keyword)
      );

      if (hasExcludedKeyword) {
        return false;
      }

      // Step 4: Must have soccer keywords
      const hasSoccerKeyword = this.soccerKeywords.some(keyword =>
        combined.includes(keyword)
      );

      // If from allowed source AND has soccer keywords, include it
      // If not from allowed source, must have STRONG soccer keywords
      if (isAllowedSource && hasSoccerKeyword) {
        return true;
      }
      
      // For non-explicitly-allowed sources, require stronger soccer relevance
      const strongSoccerKeywords = ['premier league', 'champions league', 'la liga', 
        'serie a', 'bundesliga', 'world cup', 'uefa', 'fifa', 'messi', 'ronaldo'];
      const hasStrongSoccerKeyword = strongSoccerKeywords.some(keyword =>
        combined.includes(keyword)
      );

      return hasStrongSoccerKeyword;
    });
  }

  private formatArticles(articles: any[]): NewsArticle[] {
    return articles.map(article => ({
      id: article.url || `article-${Date.now()}-${Math.random()}`,
      title: article.title || 'No title',
      description: article.description || '',
      content: article.content || article.description || '',
      imageUrl: article.urlToImage,
      source: article.source?.name || 'Unknown',
      author: article.author || null,
      publishedAt: article.publishedAt || new Date().toISOString(),
      url: article.url || '#',
      category: 'soccer'
    }));
  }

  private removeDuplicates(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Set<string>();
    return articles.filter(article => {
      const key = article.url || article.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  getMockNews(): NewsArticle[] {
    return [
      {
        id: 'mock-1',
        title: 'Premier League Title Race Heats Up After Dramatic Weekend',
        description: 'The battle for the Premier League title intensifies as top teams trade victories in a thrilling weekend of action.',
        content: 'The Premier League title race continues to captivate fans worldwide as the top contenders refuse to give ground. Manchester City and Arsenal remain locked in a fierce battle.',
        imageUrl: 'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=800',
        source: 'ESPN',
        author: 'Mark Thompson',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
        url: '#',
        category: 'soccer'
      },
      {
        id: 'mock-2',
        title: 'Liverpool Defeat Arsenal 2-0 in Premier League Clash',
        description: 'Liverpool secure vital three points with commanding performance at Anfield, goals from Salah and Gakpo seal the win.',
        content: 'Liverpool put on a dominant display against Arsenal, with Mohamed Salah and Cody Gakpo finding the net in a crucial Premier League victory.',
        imageUrl: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800',
        source: 'Sky Sports',
        author: 'James Williams',
        publishedAt: new Date(Date.now() - 7200000).toISOString(),
        url: '#',
        category: 'soccer'
      },
      {
        id: 'mock-3',
        title: 'Champions League Draw: Barcelona to Face Bayern Munich',
        description: 'The Champions League knockout stage draw has produced some tantalizing matchups including a clash between European giants.',
        content: 'The Champions League draw has set up a blockbuster tie between Barcelona and Bayern Munich, reigniting memories of their historic encounters.',
        imageUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800',
        source: 'BBC Sport',
        author: 'Sarah Johnson',
        publishedAt: new Date(Date.now() - 14400000).toISOString(),
        url: '#',
        category: 'soccer'
      },
      {
        id: 'mock-4',
        title: 'Real Madrid Confirms Major Transfer Signing',
        description: 'Real Madrid announce their latest acquisition as club continues to build for the future under Carlo Ancelotti.',
        content: 'Real Madrid have confirmed another marquee signing, demonstrating their continued ambition in the transfer market.',
        imageUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800',
        source: 'Marca',
        author: 'Carlos Rodriguez',
        publishedAt: new Date(Date.now() - 18000000).toISOString(),
        url: '#',
        category: 'soccer'
      },
      {
        id: 'mock-5',
        title: 'Messi Continues Record-Breaking Form in MLS',
        description: 'Lionel Messi scores another hat-trick as Inter Miami extend their winning run in Major League Soccer.',
        content: 'Lionel Messi has once again shown his class with another stellar performance for Inter Miami, cementing his status as the best player in MLS history.',
        imageUrl: 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=800',
        source: 'The Athletic',
        author: 'Mike Peters',
        publishedAt: new Date(Date.now() - 21600000).toISOString(),
        url: '#',
        category: 'soccer'
      }
    ];
  }
}

export const newsAPI = new NewsAPI();