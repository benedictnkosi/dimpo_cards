import { Mixpanel } from 'mixpanel-react-native';

const MIXPANEL_TOKEN = '44c9d6952845f26c209c7e42a6e8b6b3'; // Replace with your Mixpanel token

interface ReadingEventProperties {
    book_id: string;
    chapter_name: string;
    genre?: string;
    reading_level?: string;
    profile_id?: string;
    is_next_chapter?: boolean;
    user_id?: string;
}

class Analytics {
    private static instance: Analytics;
    private mixpanel: Mixpanel;
    private initialized: boolean = false;

    private constructor() {
        this.mixpanel = new Mixpanel(MIXPANEL_TOKEN, true); // Enable automatic events tracking
    }

    public static getInstance(): Analytics {
        if (!Analytics.instance) {
            Analytics.instance = new Analytics();
        }
        return Analytics.instance;
    }

    public async initialize(): Promise<void> {
        try {
            if (this.initialized) return;
            await this.mixpanel.init();
            this.initialized = true;
        } catch (error) {
            console.error('[Mixpanel] Error initializing analytics:', error);
        }
    }

    public async identify(userId: string): Promise<void> {
        try {
            await this.mixpanel.identify(userId);
        } catch (error) {
            console.error('[Mixpanel] Error identifying user:', error);
        }
    }

    public async track(eventName: string, properties?: Record<string, any>): Promise<void> {
        try {
            if (!this.initialized) {
                await this.initialize();
            }
            await this.mixpanel.track(eventName, properties);
        } catch (error) {
            console.error('[Mixpanel] Error tracking event:', error);
        }
    }

    /**
     * Track when a user starts reading a new book
     */
    public async trackStartNewBook(properties: ReadingEventProperties): Promise<void> {
        try {
            await this.track('reading_started', {
                ...properties,
                event_type: 'new_book',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('[Analytics] Error tracking start new book event:', error);
        }
    }

    /**
     * Track when a user continues reading an existing book/chapter
     */
    public async trackContinueReading(properties: ReadingEventProperties): Promise<void> {
        try {
            await this.track('reading_continued', {
                ...properties,
                event_type: 'continue_reading',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('[Analytics] Error tracking continue reading event:', error);
        }
    }

    /**
     * Track when a user completes a chapter
     */
    public async trackChapterCompleted(properties: ReadingEventProperties & {
        score?: number;
        time_spent?: number;
        words_read?: number;
    }): Promise<void> {
        try {
            await this.track('chapter_completed', {
                ...properties,
                event_type: 'chapter_completed',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('[Analytics] Error tracking chapter completed event:', error);
        }
    }

    /**
     * Track reading session start
     */
    public async trackReadingSessionStart(properties: ReadingEventProperties): Promise<void> {
        try {
            await this.track('reading_session_started', {
                ...properties,
                event_type: 'session_start',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('[Analytics] Error tracking reading session start:', error);
        }
    }

    /**
     * Track reading session end
     */
    public async trackReadingSessionEnd(properties: ReadingEventProperties & {
        session_duration?: number;
        pages_read?: number;
        words_read?: number;
    }): Promise<void> {
        try {
            await this.track('reading_session_ended', {
                ...properties,
                event_type: 'session_end',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('[Analytics] Error tracking reading session end:', error);
        }
    }
}

export const analytics = Analytics.getInstance(); 