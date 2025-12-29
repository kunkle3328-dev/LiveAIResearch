
import { AudioTelemetryEvent, TelemetryLevel, TelemetryCategory } from '../types';

type AudioFocus = 'podcast' | 'call' | 'none';
export type InterruptMode = 'pause' | 'duck';

export interface PodcastController {
    play: () => Promise<void>;
    pause: () => void;
    fadeTo: (volume: number, duration: number) => Promise<void>;
    getIsPlaying: () => boolean;
    getCurrentTime: () => number;
}

export class AudioSessionManager {
    private static instance: AudioSessionManager;
    
    private focus: AudioFocus = 'none';
    private podcastCtrl: PodcastController | null = null;
    
    // State tracking
    private resumeNeeded: boolean = false;
    private interruptMode: InterruptMode = 'pause'; 
    
    // Telemetry Ring Buffer
    private logBuffer: AudioTelemetryEvent[] = [];
    private readonly MAX_LOGS = 500;

    private constructor() {
        this.log('info', 'system', 'AudioSessionManager Initialized');
    }

    public static getInstance(): AudioSessionManager {
        if (!AudioSessionManager.instance) {
            AudioSessionManager.instance = new AudioSessionManager();
        }
        return AudioSessionManager.instance;
    }

    // --- Telemetry Methods ---

    public log(level: TelemetryLevel, category: TelemetryCategory, message: string, data?: any) {
        const event: AudioTelemetryEvent = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            timestamp: Date.now(),
            level,
            category,
            message,
            data
        };
        
        this.logBuffer.push(event);
        if (this.logBuffer.length > this.MAX_LOGS) {
            this.logBuffer.shift();
        }

        if (level === 'error') {
            console.error(`[${category}] ${message}`, data);
        } else if (process.env.NODE_ENV === 'development') {
            console.log(`[${category}] ${message}`);
        }
    }

    public getLogs(): AudioTelemetryEvent[] {
        return [...this.logBuffer];
    }

    public clearLogs() {
        this.logBuffer = [];
        this.log('info', 'system', 'Logs cleared');
    }

    public exportDebugBundle(): void {
        const bundle = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            state: this.getDebugState(),
            logs: this.logBuffer,
            performance: window.performance?.toJSON()
        };

        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nexus-debug-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.log('info', 'system', 'Debug bundle exported');
    }

    // --- Audio Control Methods ---

    public setInterruptMode(mode: InterruptMode) {
        this.interruptMode = mode;
        this.log('info', 'audio', `Interrupt mode set to ${mode}`);
    }

    public registerPodcast(ctrl: PodcastController) {
        this.podcastCtrl = ctrl;
        this.log('info', 'audio', 'Podcast Controller Registered');
    }

    public unregisterPodcast() {
        this.podcastCtrl = null;
        this.focus = 'none';
        this.resumeNeeded = false;
        this.log('info', 'audio', 'Podcast Controller Unregistered');
    }

    public requestPodcastStart(): boolean {
        if (this.focus === 'call') {
            this.log('warn', 'audio', 'Podcast start denied: Call active');
            return false;
        }
        this.focus = 'podcast';
        this.log('info', 'audio', 'Focus acquired: Podcast');
        return true;
    }

    public reportPodcastStopped() {
        if (this.focus === 'podcast') {
            this.focus = 'none';
            this.log('info', 'audio', 'Focus released: Podcast stopped');
        }
    }

    public async startCallSession(onStart: () => Promise<void> | void) {
        this.log('info', 'producer', `Starting Call Session. Current focus: ${this.focus}`);

        if (this.focus === 'call') return; 

        // Handle Interruption
        if (this.focus === 'podcast' && this.podcastCtrl?.getIsPlaying()) {
            this.log('info', 'audio', 'Interrupting Podcast', { mode: this.interruptMode });
            this.resumeNeeded = true;

            if (this.interruptMode === 'pause') {
                await this.podcastCtrl.fadeTo(0, 0.3);
                this.podcastCtrl.pause();
                this.podcastCtrl.fadeTo(1, 0); 
            } else {
                await this.podcastCtrl.fadeTo(0.15, 0.5);
            }
        } else {
            this.resumeNeeded = false;
        }

        this.focus = 'call';
        try {
            await onStart();
            this.log('info', 'producer', 'Call session started successfully');
        } catch (e) {
            this.log('error', 'producer', 'Failed to start call session', e);
            // Revert state if start failed
            this.endCallSession(() => {});
        }
    }

    public async endCallSession(onEnd: () => void) {
        this.log('info', 'producer', 'Ending Call Session');
        
        onEnd();
        this.focus = 'none';

        if (this.resumeNeeded && this.podcastCtrl) {
            this.log('info', 'audio', 'Resuming Podcast');
            
            if (this.interruptMode === 'pause') {
                await this.podcastCtrl.fadeTo(0, 0); 
                try {
                    await this.podcastCtrl.play();
                    this.focus = 'podcast';
                    await this.podcastCtrl.fadeTo(1, 0.5);
                } catch (e) {
                    this.log('error', 'audio', 'Failed to resume podcast', e);
                }
            } else {
                // Unduck
                await this.podcastCtrl.fadeTo(1, 0.5);
                this.focus = 'podcast';
            }
        }
        
        this.resumeNeeded = false;
    }

    public getDebugState() {
        return {
            focus: this.focus,
            resumeNeeded: this.resumeNeeded,
            interruptMode: this.interruptMode,
            hasController: !!this.podcastCtrl,
            podcastTime: this.podcastCtrl?.getCurrentTime() || 0
        };
    }
}
