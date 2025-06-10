import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { Bot, Send, Image as ImageIcon, Mic, MicOff, Volume2, VolumeX, RotateCcw, X } from 'lucide-react';
import { ChatMessage, ChatAttachment, Source } from './types';
import { sendChatMessage, ChatApiError } from './api';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const voiceModeRef = useRef(false);

  // Speech hooks
  const {
    isListening,
    transcript,
    isSupported: speechRecognitionSupported,
    startListening,
    stopListening,
    resetTranscript,
    restartListening
  } = useSpeechRecognition();

  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    isSupported: speechSynthesisSupported
  } = useSpeechSynthesis();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Update voice mode ref when state changes
  useEffect(() => {
    voiceModeRef.current = isVoiceMode;
  }, [isVoiceMode]);

  // Manual microphone: write transcript to input when listening stops
  useEffect(() => {
    if (transcript && !isVoiceMode && !isListening) {
      console.log('📝 Setting input from transcript:', transcript);
      setInput(prev => prev + transcript);
      resetTranscript();
    }
  }, [transcript, isVoiceMode, isListening, resetTranscript]);

  // Voice conversation handler
  const handleVoiceConversation = async (spokenText: string) => {
    console.log('🎙️ Voice conversation triggered with:', spokenText);
    
    if (!spokenText.trim()) {
      console.log('⚠️ Empty speech, restarting listening');
      if (voiceModeRef.current) {
        restartListening(handleVoiceConversation);
      }
      return;
    }

    // Reset transcript after using it
    resetTranscript();

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      message: spokenText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    stopSpeaking();

    try {
      const data = await sendChatMessage(
        spokenText,
        'chat',
        'user-session-1'
      );
      
      const botMessage: ChatMessage = {
        id: data.id || Date.now().toString(),
        type: 'bot',
        message: data.textResponse,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, botMessage]);

      // Speak response and restart listening when done
      if (data.textResponse && voiceModeRef.current) {
        console.log('🔊 Speaking response and then restarting listening');
        speak(data.textResponse, () => {
          // Restart listening after speech ends
          if (voiceModeRef.current) {
            console.log('🔄 Restarting listening after speech');
            restartListening(handleVoiceConversation);
          }
        });
      } else if (voiceModeRef.current) {
        // No response, restart listening directly
        restartListening(handleVoiceConversation);
      }
      
    } catch (error) {
      const errorMessage = error instanceof ChatApiError 
        ? error.message 
        : 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.';

      console.error('❌ Voice conversation error:', error);
      
      const botMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'bot',
        message: errorMessage,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);

      // Continue voice mode even on error
      if (voiceModeRef.current) {
        setTimeout(() => {
          if (voiceModeRef.current) {
            restartListening(handleVoiceConversation);
          }
        }, 2000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Lütfen sadece resim dosyası yükleyin.');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const contentString = reader.result as string;
        setAttachment({
          name: file.name,
          mime: file.type,
          contentString
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Dosya yükleme hatası:', error);
      alert('Dosya yüklenirken bir hata oluştu.');
    }
  };

  const handleResetChat = async () => {
    if (isLoading) return;
    
    setMessages([]);
    setIsVoiceMode(false);
    voiceModeRef.current = false;
    stopSpeaking();
    stopListening();
    resetTranscript();
    
    try {
      await sendChatMessage('', 'chat', 'user-session-1', undefined, true);
    } catch (error) {
      console.error('Chat sıfırlama hatası:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() && !attachment) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      message: input,
      timestamp: new Date(),
      attachment: attachment || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsLoading(true);
    stopSpeaking();
    resetTranscript();

    try {
      const data = await sendChatMessage(
        input,
        'chat',
        'user-session-1',
        attachment ? [attachment] : undefined
      );
      
      const botMessage: ChatMessage = {
        id: data.id || Date.now().toString(),
        type: 'bot',
        message: data.textResponse,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, botMessage]);

      // Auto-speak if enabled
      if (autoSpeak && data.textResponse) {
        setTimeout(() => {
          speak(data.textResponse);
        }, 500);
      }
      
    } catch (error) {
      const errorMessage = error instanceof ChatApiError 
        ? error.message 
        : 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.';

      console.error('Hata:', error instanceof ChatApiError ? error.message : error);
      
      const botMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'bot',
        message: errorMessage,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceToggle = () => {
    console.log('🎛️ Voice toggle clicked, current mode:', isVoiceMode);
    
    if (isVoiceMode) {
      // Stop voice mode
      console.log('⏹️ Stopping voice mode');
      setIsVoiceMode(false);
      voiceModeRef.current = false;
      stopListening();
      stopSpeaking();
    } else {
      // Start voice mode
      console.log('▶️ Starting voice mode');
      setIsVoiceMode(true);
      voiceModeRef.current = true;
      resetTranscript();
      startListening(handleVoiceConversation);
    }
  };

  const handleSpeakMessage = (message: string) => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speak(message);
    }
  };

  const handleManualVoiceInput = () => {
    console.log('🎤 Manual voice input clicked, isListening:', isListening);
    
    if (isListening) {
      stopListening();
    } else {
      // Normal microphone usage (not voice mode)
      resetTranscript();
      startListening(); // No callback = manual mode
    }
  };

  // Determine current voice mode state - priority order: loading > speaking > listening > idle
  const getCurrentVoiceState = () => {
    if (isLoading) return 'loading';
    if (isSpeaking) return 'speaking';
    if (isListening) return 'listening';
    return 'idle';
  };

  // Voice Mode Full Screen Component
  if (isVoiceMode) {
    const currentState = getCurrentVoiceState();

    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50 via-white to-green-50 flex flex-col">
        {/* Header */}
        <div className="w-full relative h-[10vh] min-h-[80px] max-h-[100px]">
          <img
            src="/header.jpg"
            className="w-full h-full object-cover"
            alt="Header"
          />
          <div 
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: 'linear-gradient(to bottom, rgba(0, 51, 102, 0.85), rgba(0, 102, 204, 0.75))'
            }}
          >
            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white drop-shadow-lg tracking-wider">
              TURGUT ÖZAL KAİHL
            </h1>
          </div>
        </div>

        {/* Voice Mode Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
          {/* Close Button */}
          <div className="absolute top-24 right-4 sm:right-8">
            <button
              onClick={handleVoiceToggle}
              className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full shadow-lg transition-colors"
              title="Sesli modu kapat"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Visual Feedback - Only show one state at a time */}
          <div className="text-center flex flex-col items-center">
            {currentState === 'listening' && (
              <div className="mb-6 flex flex-col items-center">
                <img 
                  src="/dinle.gif" 
                  alt="Dinleniyor" 
                  className="w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 lg:w-84 lg:h-84 object-cover rounded-full shadow-2xl"
                />
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-green-700 mt-6">
                  🎤 Dinleniyor...
                </p>
                <p className="text-sm sm:text-base text-green-600 mt-2">
                  Konuşmaya başlayın
                </p>
                {transcript && (
                  <div className="mt-4 p-4 bg-green-100 rounded-lg max-w-md mx-auto">
                    <p className="text-green-800 font-medium">"{transcript}"</p>
                  </div>
                )}
              </div>
            )}
            
            {currentState === 'speaking' && (
              <div className="mb-6 flex flex-col items-center">
                <img 
                  src="/konus.gif" 
                  alt="Konuşuyor" 
                  className="w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 lg:w-84 lg:h-84 object-cover rounded-full shadow-2xl"
                />
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-700 mt-6">
                  🔊 Konuşuyor...
                </p>
                <p className="text-sm sm:text-base text-blue-600 mt-2">
                  Yanıt veriliyor
                </p>
              </div>
            )}

            {currentState === 'loading' && (
              <div className="mb-6 flex flex-col items-center">
                <div className="w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 lg:w-84 lg:h-84 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center shadow-2xl">
                  <div className="flex space-x-2">
                    <div className="w-4 h-4 sm:w-6 sm:h-6 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-4 h-4 sm:w-6 sm:h-6 bg-blue-500 rounded-full animate-bounce delay-150"></div>
                    <div className="w-4 h-4 sm:w-6 sm:h-6 bg-blue-500 rounded-full animate-bounce delay-300"></div>
                  </div>
                </div>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-600 mt-6">
                  🤔 Düşünüyor...
                </p>
                <p className="text-sm sm:text-base text-blue-500 mt-2">
                  Yanıt hazırlanıyor
                </p>
              </div>
            )}
            
            {currentState === 'idle' && (
              <div className="mb-6 flex flex-col items-center">
                <div className="w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 lg:w-84 lg:h-84 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shadow-2xl">
                  <Mic className="w-18 h-18 sm:w-24 sm:h-24 lg:w-30 lg:h-30 text-gray-400" />
                </div>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-600 mt-6">
                  ⏳ Hazır...
                </p>
                <p className="text-sm sm:text-base text-gray-500 mt-2">
                  Konuşmaya başlamak için bekliyor
                </p>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-8 text-center max-w-2xl px-4">
            <div className="bg-white/80 backdrop-blur-sm p-4 sm:p-6 rounded-2xl shadow-lg">
              <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4">
                Sesli Konuşma Modu Aktif
              </h3>
              <p className="text-gray-600 text-sm sm:text-base leading-relaxed">
                Konuşun, yanıt alın ve otomatik olarak tekrar dinlemeye başlar. 
                Çıkmak için sağ üstteki ❌ butonuna basın.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="w-full relative h-[10vh] min-h-[80px] max-h-[100px]">
        <img
          src="/header.jpg"
          className="w-full h-full object-cover"
          alt="Header"
        />
        <div 
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: 'linear-gradient(to bottom, rgba(0, 51, 102, 0.85), rgba(0, 102, 204, 0.75))'
          }}
        >
          <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white drop-shadow-lg tracking-wider">
            TURGUT ÖZAL KAİHL
          </h1>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-2 sm:px-4 lg:px-6 py-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 h-full flex flex-col">
          {/* Control Panel */}
          <div className="border-b border-gray-200 p-3 sm:p-4 bg-gray-50 rounded-t-2xl">
            <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Voice Mode Toggle */}
                {speechRecognitionSupported && speechSynthesisSupported && (
                  <button
                    onClick={handleVoiceToggle}
                    disabled={isLoading}
                    className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg transition-colors font-medium ${
                      isVoiceMode
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={isVoiceMode ? 'Sesli konuşmayı durdur' : 'Sesli konuşma başlat'}
                  >
                    {isVoiceMode ? <MicOff className="w-3 h-3 sm:w-4 sm:h-4" /> : <Mic className="w-3 h-3 sm:w-4 sm:h-4" />}
                    <span className="hidden sm:inline">{isVoiceMode ? 'Sesli Mod Aktif' : 'Sesli Konuşma'}</span>
                    <span className="sm:hidden">{isVoiceMode ? 'Aktif' : 'Sesli'}</span>
                  </button>
                )}
                
                {/* Auto Speak Toggle */}
                {speechSynthesisSupported && (
                  <button
                    onClick={() => setAutoSpeak(!autoSpeak)}
                    className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-lg transition-colors ${
                      autoSpeak
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                    title={autoSpeak ? 'Otomatik konuşmayı kapat' : 'Otomatik konuşmayı aç'}
                  >
                    {autoSpeak ? <Volume2 className="w-3 h-3 sm:w-4 sm:h-4" /> : <VolumeX className="w-3 h-3 sm:w-4 sm:h-4" />}
                    <span className="hidden sm:inline">Otomatik Ses</span>
                  </button>
                )}
              </div>
              
              <button
                onClick={handleResetChat}
                disabled={isLoading}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Sıfırla</span>
              </button>
            </div>

            {/* Voice Status */}
            {(speechRecognitionSupported || speechSynthesisSupported) && (
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                {speechRecognitionSupported && (
                  <span className="flex items-center gap-1">
                    <Mic className="w-3 h-3" />
                    Ses tanıma destekleniyor
                  </span>
                )}
                {speechSynthesisSupported && (
                  <span className="flex items-center gap-1">
                    <Volume2 className="w-3 h-3" />
                    Sesli okuma destekleniyor
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
            {messages.length === 0 && (
              <div className="text-center text-gray-600 py-8">
                <div className="bg-gray-50 p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-lg">
                  <Bot className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-4 text-[#003366]" />
                  <p className="text-lg sm:text-xl lg:text-2xl font-medium mb-3">Merhaba! Size nasıl yardımcı olabilirim?</p>
                  <p className="text-gray-500">Herhangi bir sorunuzu yanıtlamaya hazırım.</p>
                  {speechRecognitionSupported && speechSynthesisSupported && (
                    <p className="text-sm text-blue-600 mt-2">💡 "Sesli Konuşma" butonuna basarak sürekli sesli sohbet edebilirsiniz!</p>
                  )}
                </div>
              </div>
            )}
            
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`mb-4 flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[85%] lg:max-w-[75%] rounded-2xl p-3 sm:p-4 ${
                    msg.type === 'user'
                      ? 'bg-[#003366] text-white shadow-lg'
                      : 'bg-gray-50 border border-gray-200 text-gray-800'
                  }`}
                >
                  {msg.type === 'bot' && (
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <Bot className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-[#003366]" />
                        <span className="font-medium text-[#003366] text-sm sm:text-base">Asistan</span>
                      </div>
                      {speechSynthesisSupported && !isVoiceMode && (
                        <button
                          onClick={() => handleSpeakMessage(msg.message)}
                          className="p-1 text-[#003366] hover:bg-gray-200 rounded transition-colors"
                          title={isSpeaking ? 'Konuşmayı durdur' : 'Sesli oku'}
                        >
                          {isSpeaking ? <VolumeX className="w-3 h-3 sm:w-4 sm:h-4" /> : <Volume2 className="w-3 h-3 sm:w-4 sm:h-4" />}
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                  {msg.attachment && (
                    <div className="mt-2">
                      <img 
                        src={msg.attachment.contentString} 
                        alt={msg.attachment.name}
                        className="max-w-full rounded-lg"
                      />
                    </div>
                  )}
                  <span className="text-xs opacity-75 mt-2 block">
                    {msg.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 sm:p-4">
                  <div className="flex items-center">
                    <Bot className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-[#003366]" />
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-[#003366] rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-[#003366] rounded-full animate-bounce delay-150"></div>
                      <div className="w-2 h-2 bg-[#003366] rounded-full animate-bounce delay-300"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-200 p-3 sm:p-4 bg-white rounded-b-2xl">
            {attachment && (
              <div className="mb-2 p-2 bg-gray-50 rounded-lg flex items-center justify-between">
                <div className="flex items-center">
                  <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-[#003366]" />
                  <span className="text-sm text-gray-600">{attachment.name}</span>
                </div>
                <button
                  onClick={() => setAttachment(null)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Kaldır
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 sm:gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={isListening ? "Dinleniyor... Konuşmaya başlayın" : "Mesajınızı yazın veya mikrofon butonuna basın..."}
                className={`flex-1 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366] transition-colors text-sm sm:text-base ${
                  isListening ? 'border-red-300 bg-red-50' : ''
                }`}
                disabled={isLoading}
              />
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                ref={fileInputRef}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="p-3 sm:p-4 text-[#003366] hover:bg-gray-100 rounded-xl transition-colors disabled:text-gray-400 disabled:hover:bg-transparent flex-shrink-0"
                title="Resim ekle"
              >
                <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              
              {/* Manual Voice Recognition Button */}
              {speechRecognitionSupported && (
                <button
                  onClick={handleManualVoiceInput}
                  disabled={isLoading}
                  className={`p-3 sm:p-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 ${
                    isListening
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'text-[#003366] hover:bg-gray-100'
                  }`}
                  title={isListening ? 'Dinlemeyi durdur' : 'Sesli mesaj'}
                >
                  {isListening ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              )}
              
              <button
                onClick={handleSendMessage}
                disabled={isLoading}
                className="bg-[#003366] hover:bg-[#004080] text-white p-3 sm:p-4 rounded-xl transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center shadow-lg flex-shrink-0"
                title="Mesaj gönder"
              >
                <Send className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;