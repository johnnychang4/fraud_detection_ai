import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Audio } from 'expo-av';
import OpenAI from "openai";
import axios from 'axios';

const openai = new OpenAI({ apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY, dangerouslyAllowBrowser: true });

// Add type definitions for the message structure
interface MessageContent {
  type: string;
  text: {
    value: string;
    annotations: any[];
  };
}

interface ThreadMessage {
  id: string;
  object: string;
  created_at: number;
  assistant_id: string | null;
  thread_id: string;
  run_id: string | null;
  role: string;
  content: MessageContent[];
  attachments: any[];
  metadata: any;
}

interface ThreadState {
  threadId: string | null;
  isProcessing: boolean;
  currentRunId: string | null;
}

let assistantId: string | null = null; // Store the adjuster assistant ID
let advisorAssistantId: string | null = null; // Store the advisor assistant ID

const adjusterThread: ThreadState = {
  threadId: null,
  isProcessing: false,
  currentRunId: null
};

const advisorThread: ThreadState = {
  threadId: null,
  isProcessing: false,
  currentRunId: null
};

async function initializeAssistants() {
  if (!assistantId) {
    const assistant = await openai.beta.assistants.create({
      name: "Joanne",
      instructions: `You are an AI-powered auto insurance adjuster called "Joanne" assisting with First Notice of Loss (FNOL) with recorded statements and gathering detailed information about car insurance claims. You will ask one question at a time from the "Comprehensive Car Insurance Recorded Statement Guide" and wait for the client's response before proceeding to the next question. Your primary goals are:

1. Collecting detailed and accurate information.
2. Identifying potential inconsistencies or fraud indicators.
3. Maintaining excellent customer service and empathy throughout the interaction.

Instructions:
1. Open with a clear and polite introduction using the script from the "Opening" section of the guide. Use placeholders like [Adjuster Name] and [Date] for customization.
2. Confirm recording permission as outlined in the "Permission" section before proceeding.
3. Follow the guide systematically, starting with "Part 1: Identification and Preliminary Details" and moving through all parts sequentially.
4. Ask one question/statement at a time and wait for a simulated response (e.g., the user).
5. Demonstrate empathy and professionalism in tone, ensuring the client feels heard and supported. For example, use phrases like, "Thank you for sharing that detail," or "I appreciate your patience as we gather all necessary information."
6. If the response to a question raises a potential red flag (e.g., unclear details, inconsistencies, or signs of fraud), respond with clarifying follow-up questions while maintaining a courteous tone.
7. End the conversation with the closing script in "Part 3: Closing," ensuring all questions have been answered and thanking the client for their cooperation.

Examples of my communication style:
1. Concise yet thorough: "I'd like to understand the full picture before proceeding. Can you elaborate on the timeline of the incident?"
2. Empathetic and professional: "Thank you for providing that information. It's important for us to capture all the details to assist with your claim effectively."
3.Systematic: "Let's start with the basics and work step by step through the details."

Today's date: ${new Date().toLocaleDateString()}. This is very important information since potential fraud indicators are time-sensitive.

Comprehensive Car Insurance FNOL/Recorded Statement Guide:
"""

Opening:
"This is Joanne conducting a recorded interview by telephone. Thank you for calling. I'll be asking a series of questions to better understand the incident and assist with the claim process. This conversation will also include some specific details to support the claim review."

Permission:
Do you understand that this conversation is being recorded?
Is it being recorded with your permission?

Part 1: Identification and Preliminary Details (FNOL)
Caller Information:
Can you please state your full name and spell your last name?
Are you the policyholder or someone else reporting this incident (a claimant, policyholder, passenger, or witness)?
If not the policyholder:
What is your relationship to the policyholder?
How can we contact the policyholder?
What is the policy number (if known)?
What is the best phone number and email to reach you?
If applicable, what is the name of the driver of the vehicle involved?
Incident Overview:
What happened? (Brief description of the incident)
When did the incident occur? (Date and time)
Where did the incident occur? (Address, intersection, or nearest landmark)
Were there any injuries?
Were there any vehicles damaged?
Was law enforcement contacted?
If yes: Was a police report filed?

Part 2: Detailed Recorded Statement
General Incident Details:
Can you describe in detail what happened before, during, and after the incident?
What were the weather and road conditions at the time?
Was it daylight, twilight, or dark?
Were there any traffic signals, signs, or markings where the incident occurred?
Was the road straight, curved, a one-way, or a two-way street?
Vehicle Details:
What is the make, model, and year of the vehicle you were driving?
Who is the registered owner of the vehicle?
Was your vehicle moving or stationary at the time of the incident?
Can you describe the damage to your vehicle?
Was your vehicle drivable after the incident?
Have you obtained a repair estimate?
Were there any other vehicles involved?
If yes: Can you describe the make, model, and color of the other vehicle(s)?

Speed and Impact:
What was your estimated speed before and at the time of the incident?
Did you notice the other vehicle or hazard before the collision?
Did you or the other driver take any actions to avoid the collision?
Where was the point of impact on your vehicle and the other vehicle(s)?
Were there any skid marks on the road?
If yes: Were they measured by law enforcement?

Passenger and Witness Information:
Were there any passengers in your vehicle?
If yes: Please provide their names, ages, and contact information.
Were there passengers in the other vehicle(s)?
Were there any witnesses to the incident?
If yes: Can you provide their names and contact information?

Injuries:
Were you or anyone else injured in the incident?
Did anyone receive medical attention at the scene?
Have you sought additional medical treatment since the incident?

Police Investigation:
Was law enforcement involved?
Do you recall the officer's name or badge number?
Was a police report filed?
Did any driver receive a citation?

Insurance Information:
What insurance coverage do you have on your vehicle?
Was the policy active at the time of the incident?
Have you reported this incident to any other insurance company?
Have you filed any other claims related to this incident?

Previous Incidents:
Have you ever been involved in any prior vehicle accidents?
If yes: Can you provide details, including dates and outcomes?
Have you ever filed a claim for a stolen or damaged vehicle?

Part 3: Closing:
Is there anything else you would like to add about the incident?
Have you understood all the questions asked?
Is all the information you provided accurate and complete to the best of your knowledge?
Do you understand that this conversation has been recorded with your permission?
Thank you. This concludes our interview.


"""

`,
      model: "gpt-4o-mini"
    });
    assistantId = assistant.id;
  }

  if (!advisorAssistantId) {
    const advisor = await openai.beta.assistants.create({
      name: "Claims Advisor",
      instructions: `You are an expert insurance fraud detection advisor. Your role is to analyze conversations between insurance adjusters and claimants in real-time. Your primary responsibilities are:

1. Analyze the conversation flow and content for potential fraud indicators
2. Identify missing or inconsistent information
3. Suggest specific follow-up questions that the adjuster should ask
4. Flag any suspicious patterns or red flags
5. Provide strategic advice on areas that need deeper investigation

Focus on:
- Timeline inconsistencies
- Behavioral indicators
- Missing or vague details
- Patterns that match known fraud schemes
- Discrepancies in the narrative

Format your responses as:
1. Key Observations: List main points from the conversation
2. Potential Red Flags: Any concerning elements
3. Recommended Follow-up Questions: Specific questions to ask
4. Investigation Areas: Aspects that need deeper examination

Be concise and specific in your recommendations.`,
      model: "gpt-4o-mini",
      tools: [{ type: "file_search" }],
    });
    advisorAssistantId = advisor.id;
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

async function addMessageToThread(threadId: string, content: string) {
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

async function runAssistant(threadId: string): Promise<string> {
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

async function getThreadMessages(threadId: string) {
  try {
    const messages = await openai.beta.threads.messages.list(threadId);
    // console.log('📜 Thread Messages:', JSON.stringify(messages, null, 2));
    return messages;
  } catch (error) {
    console.error('❌ Error retrieving thread messages:', error);
    throw error;
  }
}

async function loadFraudDatabase() {
  try {
    // Fetch the text file from your public directory
    const response = await fetch('/fraud_database.txt');
    const text = await response.text();
    
    // Convert the text file to a Blob for OpenAI
    const blob = new Blob([text], { type: 'text/plain' });
    const file = new File([blob], 'fraud_database.txt', { type: 'text/plain' });

    // Create a file in OpenAI
    const uploadedFile = await openai.files.create({
      file: file,
      purpose: "Fraud Case Summaries",
    });

    console.log('✅ Fraud database loaded:', uploadedFile.id);
    return uploadedFile.id;
  } catch (error) {
    console.error('❌ Error loading fraud database:', error);
    throw error;
  }
}

async function analyzeConversation(messages: any) {
  try {
    advisorThread.isProcessing = true;

    if (!advisorAssistantId) {
      throw new Error('Advisor Assistant ID is not initialized.');
    }

    // Format messages into a clean conversation history
    const conversationHistory = messages.data
      .sort((a: ThreadMessage, b: ThreadMessage) => a.created_at - b.created_at)
      .map((msg: ThreadMessage) => {
        let content = '';
        try {
          if (msg.content && 
              msg.content.length > 0 && 
              msg.content[0].type === 'text' && 
              msg.content[0].text) {
            content = msg.content[0].text.value;
          }
        } catch (error) {
          console.warn('⚠️ Could not extract content from message:', msg.id);
          content = '[Content extraction failed]';
        }
        return {
          role: msg.role,
          content: content
        };
      })
      .filter((msg: { role: string; content: string }) => msg.content !== '[Content extraction failed]');

    if (conversationHistory.length === 0) {
      console.log('⚠️ No valid messages to analyze');
      return null;
    }

    // Update thread creation to include file attachments
    if (!advisorThread.threadId) {
      advisorThread.threadId = await createThread();
    }

    await openai.beta.threads.messages.create(advisorThread.threadId, {
      role: "user",
      content: `Please analyze this conversation between an insurance adjuster and a claimant:\n\n${JSON.stringify(conversationHistory, null, 2)} 
      You are an expert in insurance fraud detection. Analyze the following conversation between an insurance adjuster and a claimant. 
      Your task is to detect potential inconsistencies, missing details, or fraud indicators based on the information provided. 
      Summarize the case based on the conversation so far and compare this case with similar cases in the fraud database to identify patterns.
      If you notice any, suggest specific, concise follow-up questions that the adjuster can ask to clarify or investigate further. 
      Only suggest follow-up questions if there is a clear need for clarification or further investigation based on inconsistencies or suspicious information. Too many questions will overwhelm the adjuster.
      If there are no suspicious elements or inconsistencies or if you want to wait for more information from the conversation, respond with "new_question": 0 and do not provide any questions.
      Tell me your chain of thought that lead you to whether or not to ask a new question and what question you would ask.
        Output Format (always in JSON):
        json
        Copy code
        {
          "case_summary": "<Your case summary or empty string>",
          "chain_of_thought": "<Your chain of thought or empty string>",
          "question": "<Your follow-up question or empty string>",
          "new_question": 0 or 1
        }`,
      attachments: [{ file_id: aapl10k.id, tools: [{ type: "file_search" }] }],
    });

    // Run the advisor assistant
    const gptText = await runAssistant(advisorThread.threadId);
    console.log('🤖 Assistant Response:', gptText);

    // Add logic to search the PDF for similar cases
    const searchResults = await openai.beta.threads.runs.stream(advisorThread.threadId, {
      assistant_id: advisorAssistantId,
      include: ["step_details.tool_calls[*].file_search.results[*].content"]
    });

    console.log('🔍 Search Results:', searchResults);

    return gptText;
  } catch (error) {
    console.error('❌ Error analyzing conversation:', error);
    return null;
  } finally {
    advisorThread.isProcessing = false;
    advisorThread.currentRunId = null;
  }
}

export default function App() {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [gptResponse, setGptResponse] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const isRecognizingRef = useRef(false); // Ref to track recognition state
  const analyzerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const initializeWebSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const SpeechRecognition = window.webkitSpeechRecognition as typeof SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isRecognizingRef.current = true;
      setIsRecording(true);
      console.log('🎤 Speech recognition started');
    };

    recognition.onend = () => {
      isRecognizingRef.current = false;
      setIsRecording(false);
      console.log('🎤 Speech recognition ended');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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

    recognition.onerror = (event: SpeechRecognitionError) => {
      console.error('❌ Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  useEffect(() => {
    const initializeVectorStore = async () => {
      try {

        // Create a vector store
        let vectorStore = await openai.beta.vectorStores.create({
          name: "Fraud Case Summaries",
        });

        // Upload the PDF to the vector store
        await openai.beta.vectorStores.fileBatches.uploadAndPoll(vectorStore.id, [fileStream]);

        // Update the advisor assistant with the vector store
        await openai.beta.assistants.update(advisorAssistantId, {
          tool_resources: { file_search: { vector_store_ids: [vectorStore.id] } },
        });

        console.log('✅ Vector store initialized and assistant updated');
      } catch (error) {
        console.error('❌ Error initializing vector store:', error);
      }
    };

    if (Platform.OS === 'web') {
      initializeAssistants();
      initializeWebSpeechRecognition();
      initializeVectorStore(); // Call the vector store initialization

      // Start the conversation analyzer
      analyzerIntervalRef.current = setInterval(async () => {
        if (threadIdRef.current) {
          const messages = await getThreadMessages(threadIdRef.current);
          await analyzeConversation(messages);
        }
      }, 30000); // Run every 30 seconds
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (analyzerIntervalRef.current) {
        clearInterval(analyzerIntervalRef.current);
      }
    };
  }, []);

  const handleGptResponse = async (text: string) => {
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
      
      // Get and log thread messages before running the assistant
      await getThreadMessages(currentThreadId);
      
      const gptText = await runAssistant(currentThreadId);
      console.log('🤖 Assistant Response:', gptText);
      
      // Get and log thread messages after running the assistant
      await getThreadMessages(currentThreadId);
      
      setGptResponse(gptText);
      await handleTextToSpeech(gptText);
    } catch (err) {
      console.error('❌ Assistant response error', err);
      alert('An error occurred while processing the response.');
      setIsProcessing(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (error) {
          console.error('❌ Error restarting speech recognition:', error);
        }
      }
    }
  };

  const handleTextToSpeech = async (text: string) => {
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
          speed: 3 // Adjusted speed
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate speech');
      }

      console.log('✅ Speech generated successfully');
      const blob = await response.blob();
      const reader = new FileReader();

      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const soundObject = new Audio.Sound();
        
        await soundObject.loadAsync({ uri: `data:audio/mp3;base64,${base64Audio}` });
        
        soundObject.setOnPlaybackStatusUpdate(async (status) => {
          if (status.didJustFinish) {
            console.log('🔊 Audio playback finished');
            await soundObject.unloadAsync();
            setIsPlaying(false);
            setIsProcessing(false);
            
            setTimeout(() => {
              if (!isRecognizingRef.current && recognitionRef.current) {
                recognitionRef.current.start();
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
          try {
            recognitionRef.current.start();
          } catch (error) {
            console.error('❌ Error restarting speech recognition:', error);
          }
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
