import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Audio } from 'expo-av';
import OpenAI from "openai";
import axios from 'axios';
import fraudDatabase from '../../assets/fraudDatabase';

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

interface AdjusterAssistant {
  suggestedQuestion: string;
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

const adjusterAssistant: AdjusterAssistant = {
  suggestedQuestion: ''
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

Note that there will be a claims advisor that will be monitoring the conversation for potential inconsistencies, missing details, or fraud indicators. The advisor will suggest follow-up questions if needed, and you should prioritize those questions over the ones in the guide first.

Today's date: ${new Date().toLocaleDateString()}. This is very important information since potential fraud indicators are time-sensitive.

Comprehensive Car Insurance FNOL/Recorded Statement Guide:
"""

Opening:
"This is Joanne conducting a recorded interview by telephone. Thank you for calling. I'll be asking a series of questions to better understand the incident and assist with the claim process. This conversation will also include some specific details to support the claim review."

Permission:
Do you understand that this conversation is being recorded?
Is it being recorded with your permission?

- Part 1: Identification and Preliminary Details (FNOL)
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

- Part 2: Detailed Recorded Statement 
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

- Part 3: Closing:
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
      instructions: `You are an expert claims advisor in insurance fraud detection. Your role is to analyze conversations between an insurance adjuster and a claimant in real-time.

      Your task is to detect potential inconsistencies, missing details, or fraud indicators based on the information provided.
      Compare cases with similar cases in the fraud database to identify patterns.
      If you notice any potential issues or inconsistencies or missing details or fraud indicators, suggest specific, concise follow-up questions for clarification or investigation.
      However, do not suggest follow-up questions if the conversation is proceeding normally and nothing seems suspicious.

      IMPORTANT: When you identify any issues or need clarification, you MUST use the suggestFollowUpQuestion function to suggest a specific follow-up question. Do not include questions in your regular response.

      Here is the fraud case database to reference with example follow-up questions:
      ${fraudDatabase}`,
      model: "gpt-4o-mini",
      tools: [
        {
          type: "function",
          function: {
            name: "suggestFollowUpQuestion",
            description: "Suggest a follow-up question for the adjuster if you detect potential inconsistencies, missing details, or fraud indicators based on the information provided by the client. If there isn't anything that is suspicious, wait for the conversation to continue to collect more information.",
            parameters: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description: "The follow-up question to ask the claimant.",
                },
              },
              required: ["question"],
              additionalProperties: false,
            },
          },
        },
      ],
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

async function runAssistant(threadId: string, assistantIdToUse: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullResponse = ''; // Accumulate the full response here

    openai.beta.threads.runs.stream(threadId, {
      assistant_id: assistantIdToUse
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

async function analyzeConversation(messages: any) {
  try {
    if (advisorThread.isProcessing) {
      console.log('⏳ Analysis already in progress, skipping...');
      return null;
    }

    advisorThread.isProcessing = true;
    // console.log('🔄 Starting conversation analysis...');

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

    // Create or get thread
    if (!advisorThread.threadId) {
      advisorThread.threadId = await createThread();
      // console.log('🧵 Created new advisor thread:', advisorThread.threadId);
    }

    // Check for any active runs and cancel them if they exist
    try {
      if (advisorThread.currentRunId) {
        console.log('🛑 Cancelling previous run:', advisorThread.currentRunId);
        await openai.beta.threads.runs.cancel(
          advisorThread.threadId,
          advisorThread.currentRunId
        );
      }
    } catch (error) {
      console.warn('⚠️ Error cancelling previous run:', error);
    }

    // Send the conversation for analysis
    await addMessageToThread(advisorThread.threadId, `Here is the current conversation history between the adjuster and the claimant:\n\n${JSON.stringify(conversationHistory, null, 2)}`);
    // console.log('📨 Sent conversation history to advisor');

    // Run the assistant and handle function calls
    // console.log('🤖 Running advisor assistant...');
    const advisorResponse = await runAssistantWithFunctionCalling(
      advisorThread.threadId,
      advisorAssistantId
    );
    // console.log('✅ Advisor response received:', advisorResponse);

    // Process the advisor's response
    if (advisorResponse && advisorResponse.question) {
      console.log('💡 Advisor suggests follow-up question:', advisorResponse.question);
      adjusterAssistant.suggestedQuestion = advisorResponse.question;
    } else {
      console.log('💡 Advisor does not suggest follow-up question');
    }
    
  } catch (error) {
    console.error('❌ Error analyzing conversation:', error);
    return null;
  } finally {
    advisorThread.isProcessing = false;
    advisorThread.currentRunId = null;
  }
}

async function runAssistantWithFunctionCalling(
  threadId: string,
  assistantIdToUse: string
): Promise<{ question?: string }> {
  return new Promise(async (resolve, reject) => {
    try {
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantIdToUse,
      });
      advisorThread.currentRunId = run.id;

      // Poll for run completion
      let completedRun = await openai.beta.threads.runs.retrieve(threadId, run.id);

      while (
        ['queued', 'in_progress', 'requires_action'].includes(completedRun.status)
      ) {
        if (completedRun.status === 'requires_action') {
          if (
            completedRun.required_action?.type === 'submit_tool_outputs' &&
            completedRun.required_action.submit_tool_outputs.tool_calls
          ) {
            const toolCalls = completedRun.required_action.submit_tool_outputs.tool_calls;
            
            for (const toolCall of toolCalls) {
              if (toolCall.function.name === 'suggestFollowUpQuestion') {
                const args = JSON.parse(toolCall.function.arguments);
                
                // Submit the tool outputs with the function's response
                await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
                  tool_outputs: [{
                    tool_call_id: toolCall.id,
                    output: JSON.stringify({ success: true })  // Provide a valid output
                  }]
                });

                // Return the suggested question
                resolve({ question: args.question });
                return;
              }
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        completedRun = await openai.beta.threads.runs.retrieve(threadId, run.id);
      }

      if (completedRun.status === 'completed') {
        resolve({});
      } else if (completedRun.status === 'failed') {
        reject(new Error(`Run failed: ${completedRun.last_error?.message}`));
      } else {
        console.log('⚠️ Unexpected run status:', completedRun.status);
        resolve({});
      }
    } catch (error) {
      console.error('❌ Error during assistant run:', error);
      reject(error);
    }
  });
}

// Add these type definitions at the top of your file
declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (event: Event) => void;
  onend: (event: Event) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
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

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('❌ Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      initializeAssistants();
      initializeWebSpeechRecognition();

      // Start the conversation analyzer
      analyzerIntervalRef.current = setInterval(async () => {
        if (threadIdRef.current) {
          const messages = await getThreadMessages(threadIdRef.current);
          await analyzeConversation(messages);
        }
      }, 15000); // Run every 15 seconds instead of 10
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

      // Check for advisor's suggested question
      let advisorQuestion = '';
      if (adjusterAssistant.suggestedQuestion) {
        advisorQuestion = `\n\nAdvisor suggests: ${adjusterAssistant.suggestedQuestion}`;
        adjusterAssistant.suggestedQuestion = ''; // Reset after using
      }

      // Include the advisor's suggestion in the message
      const assistantInput = text + advisorQuestion;

      await addMessageToThread(currentThreadId, assistantInput);
      
      // Get and log thread messages before running the assistant
      await getThreadMessages(currentThreadId);
      
      const gptText = await runAssistant(currentThreadId, assistantId);
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
