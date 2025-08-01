import { AudioProcessor } from "../../Helpers/AudioProcessor";
import { DynamicAudioOutput } from "../../Helpers/DynamicAudioOutput";
import { MicrophoneRecorder } from "../../Helpers/MicrophoneRecorder";
import { OpenAI } from "../OpenAI";
import { OpenAITypes } from "../OpenAITypes";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";

@component
export class ExampleOAICalls extends BaseScriptComponent {
  @ui.separator
  @ui.group_start("Chat Completions Example")
  @input textDisplay: Text;
  @input @widget(new TextAreaWidget()) private systemPrompt: string = "You are an expert interior designer. Generate a DALL·E prompt to redesign this exact room. Keep the same layout, furniture placement, and wall structure. Focus improvements on decor, lighting, colors, materials, and art. Avoid changing camera angle or architecture";
  @input @widget(new TextAreaWidget()) private userPrompt: string = "how to redecorate this area";
  @input @label("Run On Tap") private doChatCompletionsOnTap: boolean = false;
  @input private spatialGallery: ScriptComponent;
  @ui.group_end

  @ui.separator
  @ui.group_start("Image Generation Example")
  @input private imgObject: SceneObject;
  @input @widget(new TextAreaWidget()) private imageGenerationPrompt: string = "Image of captured area with Interior design or Outdoor improvement suggestions";
  @input @label("Run On Tap") private generateImageOnTap: boolean = false;
  @ui.group_end

  @ui.separator
  @ui.group_start("Voice Generation Example")
  @input @widget(new TextAreaWidget()) private voiceGenerationInstructions: string = "Neutral, very calm voice, talking like a therapist";
  @input @label("Run On Tap") private generateVoiceOnTap: boolean = false;
  @ui.group_end

  @ui.separator
  @ui.group_start("Function Calling Example")
  @input @widget(new TextAreaWidget()) private functionCallingPrompt: string = "Make the text display yellow";
  @input @label("Run On Tap") private doFunctionCallingOnTap: boolean = false;
  @ui.group_end

  @ui.separator
  @ui.group_start("Interior Design Analysis")
  @input private capturedImage: Image;
  @input private generatedDecorImage: Image;
  @input private textInput: Text;
  @input private textOutput: Text;
  @input private interactableObject: SceneObject;
  @input private snap3DGenerator: ScriptComponent;
    @input private snap3DFactory: ScriptComponent;
  @input @widget(new TextAreaWidget()) private interiorDesignPrompt: string = "Analyze this room and suggest three short and smart improvements";
  @input @label("Run Interior Design On Tap") private doInteriorDesignOnTap: boolean = false;
  @input @label("Auto-trigger 3D Generation") private autoTrigger3D: boolean = true;
  @input @label("Auto-generate Voice from Analysis") private autoGenerateVoice: boolean = true;
  @ui.group_end
  
  private rmm = require("LensStudio:RemoteMediaModule") as RemoteMediaModule;
  private gestureModule: GestureModule = require("LensStudio:GestureModule");
  private SIK = require("SpectaclesInteractionKit.lspkg/SIK").SIK;
  private interactionManager = this.SIK.InteractionManager;
  private isProcessing: boolean = false;
private interactable: Interactable | null = null;

  private currentAnalysis: string = "";
  private currentSuggestions: string = "";
  private currentLayout: string = "";
  private currentRoomType: string = "";
  private currentStyle: string = "";
  private currentColors: string = "";
  private currentEnvironment: string = "";

  private horizontalItemDesc: string = "";
  private verticalItemDesc: string = "";
  private flooringItemDesc: string = "";

  onAwake() {
        this.interactable = this.interactableObject.getComponent(Interactable.getTypeName());
if (isNull(this.interactable)) {
  print("Interactable component not found on interactableObject.");
} else {
  this.interactable.onTriggerEnd.add(() => {
    print("Interactable triggered - launching manual 3D generation...");
    this.handleInteriorDesignTrigger();
  });
  print("Interactable trigger bound successfully");
}
    this.setupInteraction();
    this.setupGestures();
  }

  private setupInteraction() {
    if (this.interactableObject) {
      const interactable = this.interactionManager.getInteractableBySceneObject(this.interactableObject);
      if (interactable) {
        interactable.onInteractorTriggerEnd(() => this.handleInteriorDesignTrigger());
      }
    }
  }

  private setupGestures() {
    if (global.deviceInfoSystem.isEditor()) {
      this.createEvent("TapEvent").bind(() => this.onTap());
    } else {
      this.gestureModule.getPinchDownEvent(GestureModule.HandType.Right).add(() => this.onTap());
    }
  }

  private onTap() {
    if (this.generateVoiceOnTap) this.doSpeechGeneration();
    if (this.generateImageOnTap) this.doImageGeneration();
    if (this.doChatCompletionsOnTap) this.doChatCompletions();
    if (this.doFunctionCallingOnTap) this.doFunctionCalling();
    if (this.doInteriorDesignOnTap) this.handleInteriorDesignTrigger();
  }

  private async handleInteriorDesignTrigger() {
    if (this.isProcessing || !this.textInput.text || !this.capturedImage) {
      print("Missing input values or already processing.");
      return;
    }

    this.isProcessing = true;
    this.textOutput.text = "Analyzing for design improvements...";

    try {
      const texture = this.capturedImage.mainPass.baseTex;
      if (!texture) {
        this.textOutput.text = "Error: No image texture found";
        return;
      }

      const base64Image = await this.encodeTextureToBase64(texture);
      
      const [roomAnalysisData, designAnalysis] = await Promise.all([
        this.analyzeRoomComprehensively(base64Image),
        this.analyzeInteriorDesign(base64Image)
      ]);

      if (designAnalysis && roomAnalysisData) {
        this.storeAnalysisResults(roomAnalysisData, designAnalysis);
        this.textOutput.text = designAnalysis;
        print("Interior Design Analysis: " + designAnalysis);

        this.generateDecorImage(`${designAnalysis}. Layout: ${roomAnalysisData.layout}`, base64Image);

        await this.generate3DItemDescriptions(base64Image, roomAnalysisData);

        if (this.autoGenerateVoice) {
          this.delayedCallback(1.0, () => this.generateVoiceFromText(this.textOutput.text));
        }

        this.delayedCallback(2.0, () => this.sendDataTo3DGenerator());
      }
    } catch (err) {
      print("ERROR: " + err);
      this.textOutput.text = "Error occurred during analysis";
    } finally {
      this.isProcessing = false;
    }
  }

  private storeAnalysisResults(roomData: any, analysis: string) {
    this.currentAnalysis = analysis;
    this.currentSuggestions = roomData.suggestions;
    this.currentLayout = roomData.layout;
    this.currentRoomType = roomData.roomType;
    this.currentStyle = roomData.style;
    this.currentColors = roomData.colors;
    this.currentEnvironment = roomData.environment;
  }

  private async generate3DItemDescriptions(base64Image: string, roomData: any) {
    try {
      const response = await OpenAI.chatCompletions({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert 3D model prompt generator. Create specific descriptions for surface placement:

            PLACEMENT RULES:
            - HORIZONTAL (surface detection): furniture/decor for horizontal surfaces (rugs, vases, plants, statues, sofas, benches, trees, cushions)
            - VERTICAL (wall placement): items for vertical surfaces (wall art, mirrors, shelves, mounted decor)
            - FLOORING (floor covering): ground/floor materials (tiles, carpet, grass tiles, wood tiles, stone)

            ENVIRONMENT DETECTION:
            - INDOOR: furniture, rugs, wall art, floor tiles
            - OUTDOOR: plants, outdoor furniture, garden art, grass/stone tiles

            Return JSON with exactly these keys:
            {
              "horizontal": "15-25 word description for horizontal surface item",
              "vertical": "15-25 word description for vertical surface item",
              "flooring": "15-25 word description for flooring material"
            }

            Match the ${roomData.environment} environment, ${roomData.style} style, and ${roomData.colors} colors.`,
          },
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: `Generate 3D descriptions for ${roomData.environment} ${roomData.roomType} space with ${roomData.style} style and ${roomData.colors} colors. Layout: ${roomData.layout}` 
              },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            ],
          },
        ],
      });

      const jsonResponse = response.choices[0].message.content?.trim() || "";
      
      try {
        const itemDescriptions = JSON.parse(jsonResponse);
        this.horizontalItemDesc = itemDescriptions.horizontal || "";
        this.verticalItemDesc = itemDescriptions.vertical || "";
        this.flooringItemDesc = itemDescriptions.flooring || "";

        if (!this.horizontalItemDesc || !this.verticalItemDesc || !this.flooringItemDesc) {
          this.generateFallback3DDescriptions(roomData);
        }
      } catch (parseError) {
        this.generateFallback3DDescriptions(roomData);
      }
    } catch (error) {
      print("Failed to generate 3D item descriptions: " + error);
      this.generateFallback3DDescriptions(roomData);
    }
  }

  private generateFallback3DDescriptions(roomData: any) {
    const style = roomData.style || "contemporary";
    const colors = roomData.colors || "neutral_tones";
    const isOutdoor = roomData.environment === "outdoor";

    if (isOutdoor) {
      this.horizontalItemDesc = `${style} outdoor planter with ${colors} ceramic pot and lush greenery for horizontal placement`;
      this.verticalItemDesc = `${style} garden wall art with ${colors} weathered finish for vertical mounting`;
      this.flooringItemDesc = `${style} outdoor grass tiles with ${colors} and natural texture for ground covering`;
    } else {
      this.horizontalItemDesc = `${style} decorative vase with ${colors} and sculptural form for horizontal surfaces`;
      this.verticalItemDesc = `${style} wall art with ${colors} and modern composition for vertical placement`;
      this.flooringItemDesc = `${style} floor tiles with ${colors} and elegant pattern for flooring`;
    }
  }

private sendDataTo3DGenerator() {
  if (!this.snap3DGenerator?.api) {
    print("3D Generator reference not set");
    return;
  }

  const analysisData = {
    furnitureDesc: this.horizontalItemDesc,
    wallArtDesc: this.verticalItemDesc,
    decorativeDesc: this.flooringItemDesc,
    roomType: this.currentRoomType,
    style: this.currentStyle,
    colors: this.currentColors,
    layout: this.currentLayout,
    suggestions: this.currentSuggestions,
    analysis: this.currentAnalysis,
    environment: this.currentEnvironment
  };
    
    const methods = ['triggerAutoGeneration', 'generateMultipleItems', 'autoGenerate3DItems'];
    
    for (const method of methods) {
      if (this.snap3DGenerator.api[method]) {
        this.snap3DGenerator.api[method](analysisData);
        print(`3D generation triggered via ${method}`);
        return;
      }
    }
     if (this.snap3DFactory?.api) {
    if (this.snap3DFactory.api.receiveRoomAnalysis) {
      this.snap3DFactory.api.receiveRoomAnalysis(analysisData);
    
      if (this.snap3DFactory.api.receiveStyleAndColors) {
      this.snap3DFactory.api.receiveStyleAndColors({
        style: this.currentStyle,
        colors: this.currentColors,
        suggestedColors: this.currentColors,
        environment: this.currentEnvironment
      });
      print("Style and color data sent to speech-controlled 3D factory");
    }
  }
}
        
    print("No compatible 3D generation method found");
  }

private sendStyleAndColorUpdate() {
  if (this.snap3DFactory?.api?.receiveStyleAndColors) {
    this.snap3DFactory.api.receiveStyleAndColors({
      style: this.currentStyle,
      colors: this.currentColors,
      suggestedColors: this.currentColors,
      environment: this.currentEnvironment
    });
    print("Style and color update sent to 3D factory");
  }
}

  private generateVoiceFromText(textContent: string) {
    if (!textContent?.trim()) return;

    OpenAI.speech({
      model: "gpt-4o-mini-tts",
      input: textContent,
      voice: "coral",
      instructions: this.voiceGenerationInstructions,
    })
      .then((response) => {
        const aud = this.sceneObject.createComponent("AudioComponent");
        aud.audioTrack = response;
        aud.play(1);
      })
      .catch((error) => print("Voice generation error: " + error));
  }

  doSpeechGeneration() {
    if (this.textOutput?.text?.trim()) {
      this.generateVoiceFromText(this.textOutput.text);
    }
  }

  private async analyzeRoomComprehensively(base64Image: string): Promise<any> {
    try {
      const response = await OpenAI.chatCompletions({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Analyze this space and return ONLY valid JSON:

            {
              "layout": "brief layout description",
              "roomType": "specific room/space type",
              "style": "observed style",
              "colors": "observed colors",
              "suggestions": "2-3 improvements",
              "environment": "indoor or outdoor"
            }

            Environment detection:
            - OUTDOOR: sky, trees, grass, patio, deck, garden
            - INDOOR: walls, ceiling, indoor furniture, rooms`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this space and detect environment:" },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            ],
          },
        ],
      });

      const jsonResponse = response.choices[0].message.content?.trim() || "";
      
      try {
        return JSON.parse(jsonResponse);
      } catch (parseError) {
        return this.createFallbackAnalysis(jsonResponse);
      }
    } catch (error) {
      return this.createFallbackAnalysis("");
    }
  }

  private createFallbackAnalysis(responseText: string): any {
    const isOutdoor = /outdoor|garden|patio|deck|sky|trees|grass/i.test(responseText);
    
    return {
      layout: "Standard layout",
      roomType: isOutdoor ? "outdoor_space" : "living_room",
      style: "contemporary",
      colors: "neutral_tones",
      suggestions: "Add contextual improvements",
      environment: isOutdoor ? "outdoor" : "indoor"
    };
  }

  private async analyzeInteriorDesign(base64Image: string): Promise<string> {
    try {
      const response = await OpenAI.chatCompletions({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a helpful AI interior designer. Reply with detected style and 2-3 short improvements. Keep under 40 words, mention room type in suggestions.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: this.textInput.text || this.interiorDesignPrompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            ],
          },
        ],
      });

      return response.choices[0].message.content?.trim() || "";
    } catch (error) {
      return "";
    }
  }

  private async generateDecorImage(prompt: string, base64Image: string) {
  try {
    const enhancedPromptResponse = await OpenAI.chatCompletions({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Create a detailed DALL-E prompt to redesign this room keeping same layout and structure. Focus on colors, textures, lighting, decorative elements. Start with 'Interior design of'.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Create DALL-E prompt for: ${prompt}` },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
          ],
        },
      ],
    });

    const enhancedPrompt = enhancedPromptResponse.choices[0].message.content?.trim() || prompt;

    const response = await OpenAI.imagesGenerate({
      model: "dall-e-3",
      prompt: enhancedPrompt,
      n: 1,
      size: "1024x1024",
    });

    print("DALL-E image generated, processing response...");
    this.processImageResponse(response, this.generatedDecorImage);
    
  } catch (error) {
    print("DALL-E generation failed: " + error);
  }
}

  private notifySpatialGallery(method: string) {
    try {
        const spatialObj = this.spatialGallery?.getSceneObject() as any
        if (spatialObj?.api?.[method]) {
            spatialObj.api[method]()
            print(`Called ${method} on spatial gallery`)
        } else {
            print(`Spatial gallery API method ${method} not found`)
        }
    } catch (error) {
        print(`Error calling spatial gallery: ${error}`)
    }
}

private processImageResponse(response: any, imageComponent: Image) {
    response.data.forEach((datum) => {
        if (datum.url) {
            const rsm = require("LensStudio:RemoteServiceModule") as RemoteServiceModule;
            const resource = rsm.makeResourceFromUrl(datum.url);
            this.rmm.loadResourceAsImageTexture(
                resource,
                (texture) => {
                    if (imageComponent) {
                        imageComponent.mainPass.baseTex = texture;
                        print("Texture loaded from URL, notifying spatial gallery...");
                        
                        this.notifySpatialGallery('notifyGeneratedImageUpdated')
                    }
                },
                () => print("Failed to load image from URL")
            );
        } else if (datum.b64_json) {
            Base64.decodeTextureAsync(
                datum.b64_json,
                (texture) => {
                    if (imageComponent) {
                        imageComponent.mainPass.baseTex = texture;
                        print("Texture loaded from base64, notifying spatial gallery...");
                        
                        this.notifySpatialGallery('notifyGeneratedImageUpdated')
                    }
                },
                () => print("Failed to decode image from base64")
            );
        }
    });
}

  public getCurrentAnalysisData() {
    return {
      analysis: this.currentAnalysis,
      suggestions: this.currentSuggestions,
      layout: this.currentLayout,
      roomType: this.currentRoomType,
      style: this.currentStyle,
      colors: this.currentColors,
      environment: this.currentEnvironment,
      horizontalItemDesc: this.horizontalItemDesc,
      verticalItemDesc: this.verticalItemDesc,
      flooringItemDesc: this.flooringItemDesc
    };
  }

  public getCurrent3DDescriptions() {
    return {
      furniture: this.horizontalItemDesc,
      wallArt: this.verticalItemDesc,
      decorative: this.flooringItemDesc,
      analysis: this.currentAnalysis,
      roomType: this.currentRoomType,
      style: this.currentStyle,
      colors: this.currentColors,
      environment: this.currentEnvironment
    };
  }

  public manualTrigger3DGeneration() {
    if (this.horizontalItemDesc && this.verticalItemDesc && this.flooringItemDesc) {
      this.sendDataTo3DGenerator();
    }
  }

  private delayedCallback(delayTime: number, callback: () => void) {
    const delayedCallbackEvent = this.createEvent("DelayedCallbackEvent");
    delayedCallbackEvent.bind(callback);
    delayedCallbackEvent.reset(delayTime);
  }

  private encodeTextureToBase64(texture: Texture): Promise<string> {
    return new Promise((resolve, reject) => {
      Base64.encodeTextureAsync(texture, resolve, reject, CompressionQuality.LowQuality, EncodingType.Jpg);
    });
  }

  doChatCompletions() {
    this.textDisplay.sceneObject.enabled = true;
    this.textDisplay.text = "Generating...";
    OpenAI.chatCompletions({
      model: "gpt-4.1-nano",
      messages: [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: this.userPrompt },
      ],
      temperature: 0.7,
    })
      .then((response) => {
        this.textDisplay.text = response.choices[0].message.content;
      })
      .catch((error) => {
        this.textDisplay.text = "Error: " + error;
      });
  }

  doImageGeneration() {
    this.imgObject.enabled = true;
    OpenAI.imagesGenerate({
      model: "dall-e-2",
      prompt: this.imageGenerationPrompt,
      n: 1,
      size: "512x512",
    })
      .then((response) => {
        this.processImageResponse(response, this.imgObject.getComponent("Image"));
      })
      .catch((error) => {
        print("Error: " + error);
      });
  }

  doFunctionCalling() {
    this.textDisplay.sceneObject.enabled = true;
    this.textDisplay.text = "Processing function call...";

    const tools: OpenAITypes.Common.Tool[] = [
      {
        type: "function",
        function: {
          name: "set-text-color",
          description: "Set the color of the text display",
          parameters: {
            type: "object",
            properties: {
              r: { type: "number", description: "Red component (0-255)" },
              g: { type: "number", description: "Green component (0-255)" },
              b: { type: "number", description: "Blue component (0-255)" },
            },
            required: ["r", "g", "b"],
          },
        },
      },
    ];

    OpenAI.chatCompletions({
      model: "gpt-4.1-nano",
      messages: [{ role: "user", content: this.functionCallingPrompt }],
      tools: tools,
      tool_choice: "auto",
      temperature: 0.7,
    })
      .then((response) => {
        const message = response.choices[0].message;
        if (message.tool_calls?.[0]?.function.name === "set-text-color") {
          const args = JSON.parse(message.tool_calls[0].function.arguments);
          this.textDisplay.textFill.color = new vec4(args.r/255, args.g/255, args.b/255, 1);
          this.textDisplay.text = `Text color set to RGB(${args.r}, ${args.g}, ${args.b})`;
        }
      })
      .catch((error) => {
        this.textDisplay.text = "Error: " + error;
      });
  }
}