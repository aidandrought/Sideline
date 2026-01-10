// services/newsApi.ts
// Soccer/Football ONLY News API - Filters out all other sports

import { API_CONFIG } from '../constants/config';

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  content: string;
  imageUrl?: string;
  source: string;
  publishedAt: string;
  url: string;
  category: 'soccer' | 'general';
}

class NewsAPI {
  private baseURL = 'https://newsapi.org/v2';

  // Keywords to EXCLUDE (American football, basketball, etc.)
  private excludedKeywords = [
    'nfl', 'nba', 'mlb', 'nhl', 'ncaa', 'super bowl', 'quarterback', 'touchdown',
    'basketball', 'baseball', 'hockey', 'american football', 'patriots', 'cowboys',
    'lakers', 'yankees', 'bulls', 'knicks', 'patriots', 'raiders'
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
            `${this.baseURL}/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${API_CONFIG.NEWS_API_KEY}`
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
        // Filter and format
        const filtered = this.filterSoccerOnly(allArticles);
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
        const filtered = this.filterSoccerOnly(data.articles || []);
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

  private filterSoccerOnly(articles: any[]): any[] {
    return articles.filter(article => {
      const text = `${article.title} ${article.description} ${article.content}`.toLowerCase();
      
      // Exclude if contains non-soccer sports keywords
      const hasExcluded = this.excludedKeywords.some(keyword => 
        text.includes(keyword.toLowerCase())
      );
      
      if (hasExcluded) return false;

      // Include if contains soccer keywords
      const hasSoccer = this.soccerKeywords.some(keyword => 
        text.includes(keyword.toLowerCase())
      );

      return hasSoccer;
    });
  }

  private formatArticles(articles: any[]): NewsArticle[] {
    return articles
      .filter(a => a.title && a.title !== '[Removed]' && a.description)
      .map(a => ({
        id: a.url,
        title: a.title,
        description: a.description || 'Read more about this story...',
        content: a.content || a.description || 'Full article content here...',
        imageUrl: a.urlToImage,
        source: a.source.name,
        publishedAt: a.publishedAt,
        url: a.url,
        category: 'soccer'
      }));
  }

  private removeDuplicates(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Set();
    return articles.filter(article => {
      if (seen.has(article.url)) return false;
      seen.add(article.url);
      return true;
    });
  }

  private getMockNews(): NewsArticle[] {
    return [
      {
        id: '1',
        title: 'Haaland Breaks Premier League Scoring Record with Hat-trick',
        description: 'Erling Haaland has set a new Premier League record, scoring his 35th goal of the season in a dominant Manchester City performance.',
        content: 'Manchester City striker Erling Haaland has shattered the Premier League single-season scoring record, netting three goals in City\'s 4-1 victory over West Ham. The Norwegian international has now scored 35 goals this season, surpassing the previous record of 34. Manager Pep Guardiola praised Haaland\'s incredible consistency and predicts he will continue breaking records.',
        imageUrl: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800',
        source: 'ESPN',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
        url: '#',
        category: 'soccer'
      },
      {
        id: '2',
        title: 'Real Madrid Secures Champions League Semi-Final Spot',
        description: 'Los Blancos advance after dramatic penalty shootout victory over Manchester City in a thrilling quarter-final clash.',
        content: 'Real Madrid has booked their place in the Champions League semi-finals following a nerve-wracking penalty shootout against Manchester City. Vinícius Júnior scored the decisive penalty.',
        imageUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800',
        source: 'UEFA',
        publishedAt: new Date(Date.now() - 7200000).toISOString(),
        url: '#',
        category: 'soccer'
      },
      {
        id: '3',
        title: 'Mbappé Confirms Summer Move to Real Madrid',
        description: 'The French superstar will join Los Blancos on a free transfer when his PSG contract expires in June.',
        content: 'Kylian Mbappé has finally confirmed his long-anticipated move to Real Madrid. The 25-year-old will join the Spanish giants on a five-year deal when his Paris Saint-Germain contract expires this summer.',
        imageUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800',
        source: 'Marca',
        publishedAt: new Date(Date.now() - 10800000).toISOString(),
        url: '#',
        category: 'soccer'
      },
      {
        id: '4',
        title: 'Arsenal Takes Control of Premier League Title Race',
        description: 'The Gunners extend their lead at the top after a crucial 3-1 victory over Liverpool at the Emirates.',
        content: 'Arsenal has taken a commanding position in the Premier League title race after defeating Liverpool 3-1 at home. Goals from Bukayo Saka, Martin Ødegaard, and Gabriel Jesus secured all three points.',
        imageUrl: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800',
        source: 'Sky Sports',
        publishedAt: new Date(Date.now() - 14400000).toISOString(),
        url: '#',
        category: 'soccer'
      },
      {
        id: '5',
        title: 'Barcelona Unveils Camp Nou Renovation Plans',
        description: 'The iconic stadium to undergo €1.5 billion transformation, increasing capacity to 110,000 seats.',
        content: 'FC Barcelona has unveiled ambitious plans to renovate Camp Nou. The €1.5 billion project will increase capacity to 110,000, making it the largest football stadium in Europe.',
        imageUrl: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800',
        source: 'Sport',
        publishedAt: new Date(Date.now() - 18000000).toISOString(),
        url: '#',
        category: 'soccer'
      },
      {
        id: '6',
        title: 'Lionel Messi Wins Record 8th Ballon d\'Or',
        description: 'The Inter Miami star adds another individual accolade after leading Argentina to World Cup glory.',
        content: 'Lionel Messi has been awarded his eighth Ballon d\'Or, extending his record. The 36-year-old won largely due to his World Cup performances with Argentina.',
        imageUrl: 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=800',
        source: 'France Football',
        publishedAt: new Date(Date.now() - 21600000).toISOString(),
        url: '#',
        category: 'soccer'
      }
    ];
  }
}

export const newsAPI = new NewsAPI();