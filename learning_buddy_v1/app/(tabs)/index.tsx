import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Audio } from 'expo-av';
import OpenAI from "openai";
import axios from 'axios';

const openai = new OpenAI({ apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY, dangerouslyAllowBrowser: true });

let assistantId = null; // Store the assistant ID

async function initializeAssistant() {
  if (!assistantId) {
    const assistant = await openai.beta.assistants.create({
      name: "Helpful Cat",
      instructions: "You are a helpful cat.",
      model: "gpt-4o"
    });
    assistantId = assistant.id;
  }
}

async function createThread() {
  try {
    const thread = await openai.beta.threads.create();
    console.log('🧵 New thread created with ID:', thread.id);
    return thread.id;
  } catch (error) {
    console.error('❌ Error creating thread:', error);
    throw error;
  }
}

async function addMessageToThread(threadId, content) {
  try {
    const message = await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: content
    });
    console.log('📩 Message added to thread:', message.id);
    return message.id;
  } catch (error) {
    console.error('❌ Error adding message to thread:', error);
    throw error;
  }
}

async function runAssistant(threadId) {
  return new Promise((resolve, reject) => {
    let fullResponse = ''; // Accumulate the full response here

    openai.beta.threads.runs.stream(threadId, {
      assistant_id: assistantId
    })
    .on('textCreated', (text) => console.log('\nassistant > '))
    .on('textDelta', (textDelta, snapshot) => {
      fullResponse += textDelta.value; // Append each delta to the full response
    })
    .on('end', () => {
      resolve(fullResponse); // Resolve the promise with the full response once streaming ends
    })
    .on('error', (error) => {
      console.error('❌ Error during assistant run:', error);
      reject(error);
    });
  });
}

export default function App() {
  const recognitionRef = useRef(null);
  const threadIdRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [gptResponse, setGptResponse] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const initializeWebSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const SpeechRecognition = window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecording(true);
      console.log('🎤 Speech recognition started');
    };

    recognition.onend = () => {
      setIsRecording(false);
      console.log('🎤 Speech recognition ended');
    };

    recognition.onresult = (event) => {
      if (!isPlaying && !isProcessing) {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }

        if (finalTranscript) {
          console.log('🎤 New transcription:', finalTranscript);
          setTranscription(finalTranscript);
          recognition.stop();
          setIsProcessing(true);
          handleGptResponse(finalTranscript);
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('❌ Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      initializeAssistant();
      initializeWebSpeechRecognition();
    }
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const handleGptResponse = async (text) => {
    try {
      console.log('💭 Sending to Assistant:', text);
      
      let currentThreadId = threadIdRef.current;

      // Create a new thread only if there isn't an existing one
      if (!currentThreadId) {
        currentThreadId = await createThread();
        threadIdRef.current = currentThreadId;
        console.log('🔗 Thread ID set to:', currentThreadId);
      }

      await addMessageToThread(currentThreadId, text);
      const gptText = await runAssistant(currentThreadId);
      console.log('🤖 Assistant Response:', gptText);
      setGptResponse(gptText);
      await handleTextToSpeech(gptText);
    } catch (err) {
      console.error('❌ Assistant response error', err);
      alert('An error occurred while processing the response.');
      setIsProcessing(false);
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }
    }
  };

  const handleTextToSpeech = async (text) => {
    try {
      console.log('🔊 Converting to speech:', text);
      setIsPlaying(true);

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice: 'alloy',
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate speech');
      }

      console.log('✅ Speech generated successfully');
      const blob = await response.blob();
      const reader = new FileReader();

      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];
        const soundObject = new Audio.Sound();
        
        await soundObject.loadAsync({ uri: `data:audio/mp3;base64,${base64Audio}` });
        
        soundObject.setOnPlaybackStatusUpdate(async (status) => {
          if (status.didJustFinish) {
            console.log('🔊 Audio playback finished');
            await soundObject.unloadAsync();
            setIsPlaying(false);
            setIsProcessing(false);
            
            setTimeout(() => {
              console.log('🎤 Attempting to restart speech recognition');
              if (recognitionRef.current) {
                try {
                  recognitionRef.current.start();
                  console.log('🎤 Speech recognition restarted successfully');
                } catch (error) {
                  console.error('❌ Error restarting speech recognition:', error);
                }
              } else {
                console.error('❌ Recognition reference is null');
              }
            }, 1000);
          }
        });

        await soundObject.playAsync();
      };

      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('❌ Error generating speech:', error);
      setIsPlaying(false);
      setIsProcessing(false);
      setTimeout(() => {
        if (recognitionRef.current) {
          recognitionRef.current.start();
        }
      }, 1000);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {isPlaying ? 'Playing response...' : 
         isProcessing ? 'Processing...' :
         isRecording ? 'Listening...' : 
         'Waiting for speech...'}
      </Text>
      {transcription ? (
        <Text style={styles.text}>Transcription: {transcription}</Text>
      ) : null}
      {gptResponse ? (
        <Text style={styles.text}>GPT Response: {gptResponse}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  text: {
    marginVertical: 8,
    textAlign: 'center',
  },
});
