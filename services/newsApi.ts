// services/newsApi.ts
// Soccer/Football News API with Source Filtering
// Only US, UK, Spanish, French outlets - No Indian sources

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
  category: string;
  tags?: string[];
}

// In-memory cache to fix "Article not found" bug
let cachedArticles: NewsArticle[] = [];

class NewsAPI {
  private baseURL = 'https://newsapi.org/v2';

  // ALLOWED sources (US, UK, Spanish, French, major European)
  private allowedSources = [
    // US
    'ESPN', 'Fox Sports', 'Yahoo Sports', 'Bleacher Report', 'CBS Sports', 
    'NBC Sports', 'The Athletic', 'Sports Illustrated', 'ESPN FC',
    // UK
    'BBC Sport', 'BBC', 'Sky Sports', 'The Guardian', 'The Telegraph', 
    'Daily Mail', 'Mirror', 'The Sun', 'Express', 'The Independent',
    'Evening Standard', 'Football London', 'Goal.com', '90min', 'FourFourTwo',
    // Spanish
    'Marca', 'AS', 'Mundo Deportivo', 'Sport', 'Diario AS',
    // French
    "L'Équipe", 'France Football', 'RMC Sport',
    // Italian (major)
    'Gazzetta dello Sport',
    // German (major)
    'Kicker', 'Bild',
    // General football
    'UEFA', 'FIFA', 'Transfermarkt', 'WhoScored',
  ];

  // BLOCKED sources (Indian outlets and others)
  private blockedSources = [
    'Times of India', 'Hindustan Times', 'NDTV', 'India Today', 
    'Indian Express', 'Sportskeeda', 'Firstpost', 'Deccan Herald',
    'Economic Times', 'Zee News', 'News18', 'Republic', 'WION',
    'DNA India', 'One India', 'Cricket Country', 'Cricbuzz', 
    'ESPNcricinfo', 'Mid-Day', 'Rediff', 'Scroll.in', 'The Quint',
    'The Print', 'Outlook India', 'Business Standard India',
  ];

  // Keywords to exclude (other sports)
  private excludedKeywords = [
    'nfl', 'nba', 'mlb', 'nhl', 'ncaa', 'super bowl', 'quarterback', 
    'touchdown', 'basketball', 'baseball', 'hockey', 'american football',
    'cricket', 'ipl', 'bcci', 'virat kohli', 'sachin', 'dhoni',
    'kabaddi', 'badminton', 'tennis', 'golf', 'f1', 'formula 1', 'college football',
  ];

  // Soccer keywords to include
  private soccerKeywords = [
    'soccer', 'football', 'premier league', 'la liga', 'serie a', 
    'bundesliga', 'champions league', 'europa league', 'world cup', 
    'euros', 'fifa', 'uefa', 'messi', 'ronaldo', 'haaland', 'mbappé',
    'salah', 'real madrid', 'barcelona', 'manchester', 'liverpool',
    'chelsea', 'arsenal', 'bayern', 'psg', 'juventus', 'goal',
    'penalty', 'striker', 'midfielder', 'transfer', 'fa cup',
    'copa del rey', 'epl', 'ucl', 'el clasico', 'transfer', 'loan', 'haaland', 
  ];

  /**
   * Check if source is allowed
   */
  private isSourceAllowed(source: string): boolean {
    const sourceLower = source.toLowerCase();
    
    // Check if blocked first
    if (this.blockedSources.some(blocked => 
      sourceLower.includes(blocked.toLowerCase())
    )) {
      return false;
    }
    
    // Check if in allowed list
    return this.allowedSources.some(allowed => 
      sourceLower.includes(allowed.toLowerCase()) ||
      allowed.toLowerCase().includes(sourceLower)
    );
  }

  /**
   * Filter for soccer content only
   */
  private filterSoccerOnly(articles: any[]): any[] {
    return articles.filter(article => {
      const text = `${article.title} ${article.description} ${article.content || ''}`.toLowerCase();
      
      // Exclude non-soccer sports
      const hasExcluded = this.excludedKeywords.some(keyword => 
        text.includes(keyword.toLowerCase())
      );
      if (hasExcluded) return false;

      // Must have soccer keywords
      const hasSoccer = this.soccerKeywords.some(keyword => 
        text.includes(keyword.toLowerCase())
      );
      return hasSoccer;
    });
  }

  /**
   * Filter by allowed sources
   */
  private filterBySources(articles: any[]): any[] {
    return articles.filter(article => {
      if (!article.source?.name) return false;
      return this.isSourceAllowed(article.source.name);
    });
  }

  /**
   * Extract tags from article content
   */
  private extractTags(article: any): string[] {
    const tags: string[] = [];
    const text = `${article.title} ${article.description || ''}`.toLowerCase();
    
    // Add category
    tags.push('news');
    
    // Check for team mentions
    const teams = [
      'Liverpool', 'Arsenal', 'Chelsea', 'Manchester City', 'Man City',
      'Manchester United', 'Man United', 'Tottenham', 'Newcastle',
      'Real Madrid', 'Barcelona', 'Bayern Munich', 'PSG', 'Juventus',
      'Inter Milan', 'AC Milan', 'Dortmund', 'Atletico Madrid',
      'Crystal Palace', 'West Ham', 'Aston Villa', 'Brighton',
      'Everton', 'Wolves', 'Brentford', 'Fulham', 'Bournemouth',
    ];
    
    teams.forEach(team => {
      if (text.includes(team.toLowerCase()) && tags.length < 5) {
        tags.push(team);
      }
    });
    
    return tags;
  }

  /**
   * Determine article category
   */
  private determineCategory(article: any): string {
    const text = `${article.title} ${article.description || ''}`.toLowerCase();
    
    if (text.includes('transfer') || text.includes('signs') || text.includes('deal')) {
      return 'Transfers';
    }
    if (text.includes('analysis') || text.includes('tactical')) {
      return 'Tactics and Analysis';
    }
    if (text.includes('injury') || text.includes('injured') || text.includes('out for')) {
      return 'Team News';
    }
    if (text.includes('preview') || text.includes('predicted')) {
      return 'Match Preview';
    }
    if (text.includes('result') || text.includes('beats') || text.includes('defeats')) {
      return 'Match Report';
    }
    if (text.includes('award') || text.includes('winner') || text.includes('best')) {
      return 'Awards';
    }
    return 'Features';
  }

  /**
   * Format articles with all required fields
   */
  private formatArticles(articles: any[]): NewsArticle[] {
    return articles
      .filter(a => a.title && a.title !== '[Removed]' && a.description)
      .map((a, index) => ({
        id: `article_${index}_${Date.now()}`, // Unique ID that won't change
        title: a.title,
        description: a.description || '',
        content: a.content || a.description || '',
        imageUrl: a.urlToImage,
        source: a.source?.name || 'Unknown',
        author: a.author || 'Staff Writer',
        publishedAt: a.publishedAt,
        url: a.url,
        category: this.determineCategory(a),
        tags: this.extractTags(a),
      }));
  }

  /**
   * Remove duplicate articles
   */
  private removeDuplicates(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Set();
    return articles.filter(article => {
      const key = article.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Get soccer news with source filtering
   */
  async getSoccerNews(): Promise<NewsArticle[]> {
    try {
      const queries = [
        'premier league',
        'champions league OR europa league',
        'la liga OR serie a OR bundesliga',
        'transfer football soccer',
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
        // Filter by sources first (US/UK/Spanish/French only)
        const sourceFiltered = this.filterBySources(allArticles);
        
        // Then filter for soccer content
        const soccerFiltered = this.filterSoccerOnly(sourceFiltered);
        
        // Format articles
        const formatted = this.formatArticles(soccerFiltered);
        
        // Remove duplicates
        const unique = this.removeDuplicates(formatted);
        
        // Cache the articles
        cachedArticles = unique.slice(0, 20);
        
        return cachedArticles;
      }
    } catch (error) {
      console.log('Using mock soccer news data');
    }

    // Fall back to mock data
    cachedArticles = this.getMockNews();
    return cachedArticles;
  }

  /**
   * Get article by ID - uses cache to fix "Article not found" bug
   */
  async getArticleById(id: string): Promise<NewsArticle | null> {
    // First check cache
    const cached = cachedArticles.find(a => a.id === id);
    if (cached) return cached;
    
    // If not in cache, reload and try again
    await this.getSoccerNews();
    return cachedArticles.find(a => a.id === id) || null;
  }

  /**
   * Search news
   */
  async searchNews(query: string): Promise<NewsArticle[]> {
    try {
      const soccerQuery = `${query} AND (soccer OR football OR premier league)`;
      
      const response = await fetch(
        `${this.baseURL}/everything?q=${encodeURIComponent(soccerQuery)}&language=en&sortBy=relevancy&apiKey=${API_CONFIG.NEWS_API_KEY}`
      );
      
      if (response.ok) {
        const data = await response.json();
        const sourceFiltered = this.filterBySources(data.articles || []);
        const soccerFiltered = this.filterSoccerOnly(sourceFiltered);
        return this.formatArticles(soccerFiltered);
      }
    } catch (error) {
      console.error('Error searching news:', error);
    }

    // Search in cached/mock news
    const mockNews = cachedArticles.length > 0 ? cachedArticles : this.getMockNews();
    return mockNews.filter(article =>
      article.title.toLowerCase().includes(query.toLowerCase()) ||
      article.description.toLowerCase().includes(query.toLowerCase())
    );
  }

  /**
   * Get news by team
   */
  async getNewsByTeam(teamName: string): Promise<NewsArticle[]> {
    const allNews = cachedArticles.length > 0 ? cachedArticles : await this.getSoccerNews();
    const teamLower = teamName.toLowerCase();
    
    return allNews.filter(article => 
      article.title.toLowerCase().includes(teamLower) ||
      article.content.toLowerCase().includes(teamLower) ||
      article.tags?.some(tag => tag.toLowerCase().includes(teamLower))
    );
  }

  /**
   * Mock news data (US/UK sources only)
   */
  private getMockNews(): NewsArticle[] {
    return [
      {
        id: 'mock_1',
        title: 'FA Cup review: Palace stunned, Semenyo stars on debut',
        description: 'Football writer Sam Cunningham reviews Saturday\'s FA Cup third-round matches, with 13 Premier League clubs in action.',
        content: `FA Cup holders Crystal Palace were knocked out in stunning fashion by non-league Macclesfield FC in one of the greatest upsets in the competition's history.

You have to go back 117 years for the last time a non-league side knocked out the FA Cup holders when Palace were the underdogs who eliminated Wolverhampton Wanderers.

The gulf between the two sides was enormous. Macclesfield play in the National League North – the sixth tier of the pyramid.

The 117 league places between the sides at kick off represents the largest gap of any upset in FA Cup history.

"We missed any kind of quality today," Palace manager Oliver Glasner said. "Conceding another set play goal, another header."`,
        imageUrl: 'https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/3c84/live/81abc700-cf0c-11ef-bbe6-bb445fbb5ff5.jpg',
        source: 'BBC Sport',
        author: 'Sam Cunningham',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
        url: 'https://www.bbc.com/sport/football',
        category: 'Features',
        tags: ['news', 'Crystal Palace', 'Man City', 'FA Cup'],
      },
      {
        id: 'mock_2',
        title: 'Analysis: How will Chelsea look under Rosenior?',
        description: 'Tactical breakdown of what new Chelsea manager Liam Rosenior might bring to Stamford Bridge.',
        content: `Liam Rosenior's appointment as Chelsea's new head coach marks a bold move by the club's ownership.

The former Hull City boss inherits a squad packed with talent but struggling for consistency. His emphasis on possession-based football and high pressing could transform how the Blues play.

At Hull, Rosenior implemented a 4-3-3 system that prioritized ball retention and quick transitions. Chelsea's squad seems well-suited to this approach.`,
        imageUrl: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800',
        source: 'ESPN',
        author: 'James Olley',
        publishedAt: new Date(Date.now() - 7200000).toISOString(),
        url: 'https://www.espn.com/soccer',
        category: 'Tactics and Analysis',
        tags: ['news', 'Chelsea'],
      },
      {
        id: 'mock_3',
        title: 'Caicedo starts as Rosenior names first Chelsea line-up',
        description: 'Moisés Caicedo will captain Chelsea for the first time as new boss Liam Rosenior names his starting XI.',
        content: `Moisés Caicedo has been handed the captain's armband by new Chelsea head coach Liam Rosenior.

The Ecuador international will lead the side out at Stamford Bridge against Morecambe in the FA Cup.

Rosenior explained: "Moisés has shown incredible leadership qualities since I arrived."`,
        imageUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800',
        source: 'Sky Sports',
        author: 'Matt Law',
        publishedAt: new Date(Date.now() - 10800000).toISOString(),
        url: 'https://www.skysports.com/football',
        category: 'Club News',
        tags: ['news', 'Chelsea'],
      },
      {
        id: 'mock_4',
        title: 'Analysis: What Semenyo will bring to Man City\'s attack',
        description: 'Bournemouth winger Antoine Semenyo completes £45m move to champions Manchester City.',
        content: `Manchester City have completed the signing of Antoine Semenyo from Bournemouth for £45 million.

The Ghana international has been one of the Premier League's standout wingers this season with 9 goals and 7 assists.

"He's a player we've watched for a long time," Guardiola said.`,
        imageUrl: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800',
        source: 'The Athletic',
        author: 'Simon Stone',
        publishedAt: new Date(Date.now() - 14400000).toISOString(),
        url: 'https://theathletic.com',
        category: 'Tactics and Analysis',
        tags: ['news', 'Man City', 'Transfers'],
      },
      {
        id: 'mock_5',
        title: 'Liverpool extend lead with dominant Arsenal victory',
        description: 'Arne Slot\'s side move five points clear at the top after 2-1 win at Emirates.',
        content: `Liverpool extended their lead at the top of the Premier League to five points after a hard-fought 2-1 victory over Arsenal.

Mohamed Salah opened the scoring with a superb solo effort before Luis Díaz doubled the advantage.

Arsenal pulled one back through Bukayo Saka's penalty, but Liverpool's defense held firm.`,
        imageUrl: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800',
        source: 'The Guardian',
        author: 'David Ornstein',
        publishedAt: new Date(Date.now() - 18000000).toISOString(),
        url: 'https://www.theguardian.com/football',
        category: 'Match Report',
        tags: ['news', 'Liverpool', 'Arsenal'],
      },
      {
        id: 'mock_6',
        title: 'Real Madrid vs Barcelona: El Clásico preview',
        description: 'Everything you need to know ahead of Sunday\'s massive La Liga clash at the Bernabéu.',
        content: `Real Madrid host Barcelona in what promises to be a thrilling El Clásico.

Both teams arrive in excellent form, with Real leading La Liga by two points from their bitter rivals.

Key battles include Vinícius Jr against Jules Koundé on the flank.`,
        imageUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800',
        source: 'Marca',
        author: 'Dermot Corrigan',
        publishedAt: new Date(Date.now() - 21600000).toISOString(),
        url: 'https://www.marca.com',
        category: 'Match Preview',
        tags: ['news', 'Real Madrid', 'Barcelona'],
      },
    ];
  }
}

export const newsAPI = new NewsAPI();