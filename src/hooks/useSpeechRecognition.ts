import { useState, useEffect, useRef, useCallback } from 'react';

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export const useSpeechRecognition = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onSpeechEndRef = useRef<((text: string) => void) | null>(null);
  const finalTranscriptRef = useRef('');
  const isVoiceModeRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);
  const lastProcessedTextRef = useRef('');
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
    }
  }, []);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    isProcessingRef.current = false;
  }, []);

  const checkMicrophonePermission = async (): Promise<boolean> => {
    try {
      // Modern browsers - check permissions API
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (permission.state === 'denied') {
          return false;
        }
      }

      // Try to get user media to test microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Mikrofon izni kontrolü hatası:', error);
      return false;
    }
  };

  const processVoiceResult = useCallback((text: string) => {
    const trimmedText = text.trim();
    
    // Prevent duplicate processing
    if (isProcessingRef.current || !trimmedText || trimmedText === lastProcessedTextRef.current) {
      console.log('🚫 Skipping duplicate or empty result:', trimmedText);
      return;
    }

    // Check minimum length to avoid processing single words accidentally
    if (trimmedText.length < 2) {
      console.log('🚫 Text too short, ignoring:', trimmedText);
      return;
    }

    console.log('✅ Processing voice result:', trimmedText);
    isProcessingRef.current = true;
    lastProcessedTextRef.current = trimmedText;

    // Stop recognition immediately to prevent further results
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // Process the result
    if (onSpeechEndRef.current) {
      const callback = onSpeechEndRef.current;
      setTimeout(() => {
        callback(trimmedText);
      }, 100);
    }
  }, []);

  const startListening = useCallback(async (onSpeechEnd?: (text: string) => void) => {
    if (!isSupported) return;

    // Check microphone permission first
    const hasPermission = await checkMicrophonePermission();
    if (!hasPermission) {
      alert('Mikrofon erişimi reddedildi. Lütfen tarayıcı ayarlarından mikrofon iznini verin ve sayfayı yenileyin.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Cleanup any existing recognition
    cleanup();

    console.log('🎤 Starting speech recognition', onSpeechEnd ? '(Voice Mode)' : '(Manual Mode)');
    
    // Set mode flags
    isVoiceModeRef.current = !!onSpeechEnd;
    onSpeechEndRef.current = onSpeechEnd || null;
    finalTranscriptRef.current = '';
    isProcessingRef.current = false;
    lastProcessedTextRef.current = '';

    // Create new recognition instance
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    // Mobile-optimized settings
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    recognition.continuous = !isMobile; // Disable continuous on mobile
    recognition.interimResults = true;
    recognition.lang = 'tr-TR';

    // Mobile-specific timeout for auto-stop
    let autoStopTimeout: NodeJS.Timeout | null = null;

    recognition.onstart = () => {
      console.log('✅ Speech recognition started');
      setIsListening(true);
      setTranscript('');
      
      // Auto-stop after 10 seconds on mobile to prevent hanging
      if (isMobile && isVoiceModeRef.current) {
        autoStopTimeout = setTimeout(() => {
          if (recognitionRef.current && isListening) {
            console.log('⏰ Auto-stopping recognition after timeout');
            recognition.stop();
          }
        }, 10000);
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Clear auto-stop timeout if we get results
      if (autoStopTimeout) {
        clearTimeout(autoStopTimeout);
        autoStopTimeout = null;
      }

      let interimTranscript = '';
      let finalTranscript = '';
      let hasNewFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();

        if (result.isFinal && transcript) {
          finalTranscript += transcript;
          finalTranscriptRef.current += transcript;
          hasNewFinal = true;
        } else if (transcript) {
          interimTranscript += transcript;
        }
      }

      // Update transcript display
      const currentTranscript = finalTranscriptRef.current + interimTranscript;
      if (currentTranscript) {
        console.log('📝 Transcript updated:', currentTranscript);
        setTranscript(currentTranscript);
      }

      // For voice mode, process final results with debouncing
      if (hasNewFinal && isVoiceModeRef.current && !isProcessingRef.current) {
        const fullText = finalTranscriptRef.current.trim();
        console.log('🎯 Got final result:', fullText);
        
        if (fullText && fullText.length > 1) {
          // Clear any existing silence timeout
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
          
          // Wait a bit for potential additional results, then process
          silenceTimeoutRef.current = setTimeout(() => {
            if (!isProcessingRef.current) {
              processVoiceResult(fullText);
            }
          }, isMobile ? 500 : 300);
        }
      }

      // On mobile, also handle interim results if they seem complete
      if (isMobile && isVoiceModeRef.current && !isProcessingRef.current && interimTranscript) {
        const fullText = (finalTranscriptRef.current + interimTranscript).trim();
        
        // If interim result looks complete (ends with punctuation or is long enough)
        if (fullText.length > 3 && (
          fullText.endsWith('.') || 
          fullText.endsWith('?') || 
          fullText.endsWith('!') ||
          fullText.length > 10
        )) {
          console.log('📱 Mobile: Processing interim result that looks complete:', fullText);
          
          // Clear any existing timeout
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
          
          silenceTimeoutRef.current = setTimeout(() => {
            if (!isProcessingRef.current) {
              processVoiceResult(fullText);
            }
          }, 800);
        }
      }
    };

    recognition.onend = () => {
      console.log('🛑 Speech recognition ended');
      setIsListening(false);
      recognitionRef.current = null;
      
      if (autoStopTimeout) {
        clearTimeout(autoStopTimeout);
        autoStopTimeout = null;
      }
      
      // For manual mode, keep the transcript
      if (!isVoiceModeRef.current && finalTranscriptRef.current) {
        console.log('💾 Keeping transcript for manual input:', finalTranscriptRef.current);
        setTranscript(finalTranscriptRef.current);
      }
      
      // Reset processing flag after a delay
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (autoStopTimeout) {
        clearTimeout(autoStopTimeout);
        autoStopTimeout = null;
      }
      
      // Handle different error types appropriately
      if (event.error === 'aborted') {
        console.log('ℹ️ Speech recognition was aborted (normal operation)');
      } else if (event.error === 'not-allowed') {
        console.error('❌ Microphone permission denied');
        alert('Mikrofon erişimi reddedildi. Lütfen tarayıcı ayarlarından mikrofon iznini verin ve sayfayı yenileyin.');
      } else if (event.error === 'no-speech') {
        console.log('ℹ️ No speech detected');
        // On mobile, restart listening if in voice mode and no speech detected
        if (isMobile && isVoiceModeRef.current && !isProcessingRef.current) {
          setTimeout(() => {
            if (isVoiceModeRef.current && onSpeechEndRef.current) {
              console.log('🔄 Restarting after no-speech on mobile');
              startListening(onSpeechEndRef.current);
            }
          }, 1000);
        }
      } else {
        console.error('❌ Speech recognition error:', event.error);
      }
      setIsListening(false);
      recognitionRef.current = null;
      
      // Reset processing flag
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
    };

    try {
      recognition.start();
    } catch (error) {
      console.error('❌ Error starting recognition:', error);
      setIsListening(false);
      recognitionRef.current = null;
      isProcessingRef.current = false;
    }
  }, [isSupported, cleanup, processVoiceResult]);

  const stopListening = useCallback(() => {
    console.log('⏹️ Stopping speech recognition');
    isVoiceModeRef.current = false;
    onSpeechEndRef.current = null;
    isProcessingRef.current = false;
    lastProcessedTextRef.current = '';
    cleanup();
  }, [cleanup]);

  const resetTranscript = useCallback(() => {
    console.log('🔄 Resetting transcript');
    setTranscript('');
    finalTranscriptRef.current = '';
    lastProcessedTextRef.current = '';
    isProcessingRef.current = false;
  }, []);

  // Function specifically for voice mode to restart listening
  const restartListening = useCallback((onSpeechEnd: (text: string) => void) => {
    console.log('🔄 Restarting listening for voice mode');
    
    // Clear any existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }
    
    // Reset processing state
    isProcessingRef.current = false;
    lastProcessedTextRef.current = '';
    
    // Set a timeout to restart listening
    timeoutRef.current = setTimeout(() => {
      if (isVoiceModeRef.current) {
        startListening(onSpeechEnd);
      }
    }, 1500); // Longer delay for mobile stability
  }, [startListening]);

  return {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    restartListening
  };
};