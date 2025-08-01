import { Snap3D } from 'Remote Service Gateway/HostedSnap/Snap3D';
import { Snap3DTypes } from 'Remote Service Gateway/HostedSnap/Snap3DTypes';
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";

@component
export class EnhancedSnap3DInteriorDesign extends BaseScriptComponent {
  @ui.separator
  @ui.group_start("AI Analysis Data - Auto Received")
  @input @widget(new TextAreaWidget()) private roomAnalysis: string = "";
  @input @widget(new TextAreaWidget()) private designSuggestions: string = "";
  @input @widget(new TextAreaWidget()) private roomLayout: string = "";
  @input @widget(new TextAreaWidget()) private roomType: string = "";
  @input @widget(new TextAreaWidget()) private roomStyle: string = "";
  @input @widget(new TextAreaWidget()) private roomColors: string = "";
  @input @widget(new TextAreaWidget()) private roomEnvironment: string = "";
  @ui.group_end

  @ui.separator
  @ui.group_start("3D Generation Settings")
  @input private refineMesh: boolean = true;
  @input private useVertexColor: boolean = false;
  @input @label("Auto-enhance prompts with AI data") private enhancePrompts: boolean = true;
  @ui.group_end

  @ui.separator
  @ui.group_start("3D Item Descriptions - Auto Generated from AI")
  @input @widget(new TextAreaWidget()) private furnitureItemDesc: string = "";
  @input @widget(new TextAreaWidget()) private wallArtItemDesc: string = "";
  @input @widget(new TextAreaWidget()) private decorativeItemDesc: string = "";
  @ui.group_end

  @ui.separator
  @ui.group_start("3D Asset Display")
  @input imageRoot: Image;
  @input furnitureRoot: SceneObject;
  @input wallArtRoot: SceneObject;
  @input decorativeRoot: SceneObject;
  @input modelMat: Material;
  @input hintText: Text;
  @input interactableObject: SceneObject;
  @ui.group_end

  @ui.separator
  @ui.group_start("AI Integration")
  @input aiAssistantScript: ScriptComponent;
  @ui.group_end

  private loaderSpinnerImage: SceneObject;
  private furnitureSpinner: SceneObject;
  private wallArtSpinner: SceneObject;
  private decorativeSpinner: SceneObject;

  private furnitureSceneObject: SceneObject = null;
  private wallArtSceneObject: SceneObject = null;
  private decorativeSceneObject: SceneObject = null;

  private availableToRequest: boolean = false;
  private currentGenerationStep: number = 0;
  private totalSteps: number = 3;
  private isGenerating: boolean = false;
  private hasValidAnalysis: boolean = false;

  private gestureModule: GestureModule = require("LensStudio:GestureModule");
  private interactable: Interactable | null = null;

  private aiAnalysisData: {
    analysis: string;
    suggestions: string;
    layout: string;
    roomType: string;
    style: string;
    colors: string;
    environment: string;
    horizontalItemDesc: string;
    verticalItemDesc: string;
    flooringItemDesc: string;
  } = {
    analysis: "",
    suggestions: "",
    layout: "",
    roomType: "",
    style: "",
    colors: "",
    environment: "",
    horizontalItemDesc: "",
    verticalItemDesc: "",
    flooringItemDesc: ""
  };

  private furniturePrompt: string = "";
  private wallArtPrompt: string = "";
  private decorativePrompt: string = "";

  onAwake() {
    this.initializeSpinners();
    this.imageRoot.enabled = false;
    this.setupInteraction();
    this.setupGestures();
    this.availableToRequest = false;
    this.hasValidAnalysis = false;
    this.hintText.text = "Snap3D Auto-Generated Items";
    
    this.setupAPIEndpoints();
    
    print("Enhanced 3D Generator initialized - waiting for AI analysis");
  }

  private setupAPIEndpoints() {
    this.api.triggerAutoGeneration = (data: any) => this.triggerAutoGeneration(data);
    this.api.generateMultipleItems = (data: any) => this.triggerAutoGeneration(data);
    this.api.autoGenerate3DItems = (data: any) => this.triggerAutoGeneration(data);
    
    this.api.updateAIAnalysisData = (data: any) => this.updateAIAnalysisData(data);
    this.api.regenerateWithCurrentData = () => this.regenerateWithCurrentData();
    this.api.getStoredAnalysisData = () => this.getStoredAnalysisData();
    this.api.resetGenerator = () => this.resetGeneratorState();
  }

  private setupInteraction() {
    if (this.interactableObject) {
      this.interactable = this.interactableObject.getComponent(Interactable.getTypeName());
      if (isNull(this.interactable)) {
        print("Interactable component not found on interactableObject.");
      } else {
        this.interactable.onTriggerEnd.add(() => {
          print("Interactable triggered - launching 3D generation...");
          this.handleInteractableTrigger();
        });
        print("Interactable trigger bound successfully");
      }
    }
  }

  private setupGestures() {
    if (!global.deviceInfoSystem.isEditor()) {
      this.gestureModule.getPinchDownEvent(GestureModule.HandType.Right).add(() => {
        this.handleInteractableTrigger();
      });
    }
  }

  private handleInteractableTrigger() {
    if (this.isGenerating) {
      this.hintText.text = "Generation in progress, please wait...";
      print("Generation already in progress");
      return;
    }

    if (!this.hasValidAnalysis) {
      this.hintText.text = "Please wait for AI analysis to complete...";
      print("No valid AI analysis available yet");
      return;
    }

    print("Interactable trigger - regenerating with current AI analysis");
    this.regenerateWithCurrentData();
  }

  public triggerAutoGeneration(data: any) {
    if (this.isGenerating) {
      print("Generation in progress, queueing auto generation");
      this.delayedCallback(2.0, () => this.triggerAutoGeneration(data));
      return;
    }

    print("Received AI analysis data for 3D generation");
    
    this.updateAIAnalysisData(data);
    
    this.processItemDescriptions(data);
    
    this.updateUIFields();
    
    this.hasValidAnalysis = true;
    
    this.startAutoGeneration();
  }

  private updateAIAnalysisData(data: any) {
    this.aiAnalysisData = {
      analysis: data.analysis || "",
      suggestions: data.suggestions || "",
      layout: data.layout || "",
      roomType: data.roomType || "",
      style: data.style || "",
      colors: data.colors || "",
      environment: data.environment || "",
      horizontalItemDesc: data.horizontalItemDesc || data.furnitureDesc || "",
      verticalItemDesc: data.verticalItemDesc || data.wallArtDesc || "",
      flooringItemDesc: data.flooringItemDesc || data.decorativeDesc || ""
    };

    print("AI Analysis Data Stored:");
    print("   Room Type: " + this.aiAnalysisData.roomType);
    print("   Style: " + this.aiAnalysisData.style);
    print("   Colors: " + this.aiAnalysisData.colors);
    print("   Environment: " + this.aiAnalysisData.environment);
    print("   Layout: " + this.aiAnalysisData.layout);
    print("   Horizontal Item: " + this.aiAnalysisData.horizontalItemDesc);
    print("   Vertical Item: " + this.aiAnalysisData.verticalItemDesc);
    print("   Flooring Item: " + this.aiAnalysisData.flooringItemDesc);
  }

  private processItemDescriptions(data: any) {
    this.furniturePrompt = data.horizontalItemDesc || data.furnitureDesc || "";
    this.wallArtPrompt = data.verticalItemDesc || data.wallArtDesc || "";
    this.decorativePrompt = data.flooringItemDesc || data.decorativeDesc || "";

    if (this.enhancePrompts && this.aiAnalysisData.style && this.aiAnalysisData.colors) {
      this.enhancePromptsWithAIContext();
    }

    print("3D Item Descriptions Processed:");
    print("   Furniture: " + this.furniturePrompt);
    print("   Wall Art: " + this.wallArtPrompt);
    print("   Decorative: " + this.decorativePrompt);
  }

  private enhancePromptsWithAIContext() {
    const contextSuffix = this.buildContextSuffix();
    
    if (this.furniturePrompt && contextSuffix) {
      this.furniturePrompt = `${this.furniturePrompt}${contextSuffix}`;
    }
    
    if (this.wallArtPrompt && contextSuffix) {
      this.wallArtPrompt = `${this.wallArtPrompt}${contextSuffix}`;
    }
    
    if (this.decorativePrompt && contextSuffix) {
      this.decorativePrompt = `${this.decorativePrompt}${contextSuffix}`;
    }
  }

  private buildContextSuffix(): string {
    const parts = [];
    
    if (this.aiAnalysisData.style) {
      parts.push(`${this.aiAnalysisData.style} style`);
    }
    
    if (this.aiAnalysisData.colors) {
      parts.push(`${this.aiAnalysisData.colors} color scheme`);
    }
    
    if (this.aiAnalysisData.environment) {
      parts.push(`${this.aiAnalysisData.environment} setting`);
    }
    
    return parts.length > 0 ? `, ${parts.join(', ')}` : "";
  }

  private updateUIFields() {
    this.roomAnalysis = this.aiAnalysisData.analysis;
    this.designSuggestions = this.aiAnalysisData.suggestions;
    this.roomLayout = this.aiAnalysisData.layout;
    this.roomType = this.aiAnalysisData.roomType;
    this.roomStyle = this.aiAnalysisData.style;
    this.roomColors = this.aiAnalysisData.colors;
    this.roomEnvironment = this.aiAnalysisData.environment;
    
    this.furnitureItemDesc = this.aiAnalysisData.horizontalItemDesc;
    this.wallArtItemDesc = this.aiAnalysisData.verticalItemDesc;
    this.decorativeItemDesc = this.aiAnalysisData.flooringItemDesc;
  }

  private startAutoGeneration() {
    if (!this.furniturePrompt || !this.wallArtPrompt || !this.decorativePrompt) {
      this.hintText.text = "Missing AI-generated 3D descriptions";
      print("Missing 3D item descriptions from AI analysis");
      return;
    }

    if (this.isGenerating) {
      print("Generation already in progress");
      return;
    }

    this.isGenerating = true;
    this.availableToRequest = false;
    this.resetAssets();
    this.currentGenerationStep = 0;
    this.enableSpinners(true);
    
    const environmentText = this.aiAnalysisData.environment || "space";
    const styleText = this.aiAnalysisData.style || "design";
    this.hintText.text = `Generating ${environmentText} ${styleText} assets...`;
    
    print("Starting AI-guided 3D generation");
    this.generateNextItem();
  }

  private generateNextItem() {
    switch (this.currentGenerationStep++) {
      case 0: 
        this.generateModel("furniture", this.furniturePrompt, this.furnitureRoot, this.furnitureSpinner, (gltf) => this.furnitureSceneObject = gltf); 
        break;
      case 1: 
        this.generateModel("wall art", this.wallArtPrompt, this.wallArtRoot, this.wallArtSpinner, (gltf) => this.wallArtSceneObject = gltf); 
        break;
      case 2: 
        this.generateModel("decorative", this.decorativePrompt, this.decorativeRoot, this.decorativeSpinner, (gltf) => this.decorativeSceneObject = gltf); 
        break;
      default: 
        this.completeGeneration(); 
        break;
    }
  }

  private generateModel(itemType: string, prompt: string, root: SceneObject, spinner: SceneObject, assign: (gltf: SceneObject) => void) {
    this.hintText.text = `Generating ${itemType} for ${this.aiAnalysisData.roomType || "room"}...`;
    print(`Generating ${itemType}: ${prompt}`);

    Snap3D.submitAndGetStatus({ 
      prompt, 
      format: "glb", 
      refine: this.refineMesh, 
      use_vertex_color: this.useVertexColor 
    })
    .then((res) => {
      res.event.add(([value, asset]) => {
        if (value === "refined_mesh") {
          const obj = (asset as Snap3DTypes.GltfAssetData).gltfAsset.tryInstantiate(root, this.modelMat);
          assign(obj);
          spinner.enabled = false;
          print(`${itemType} generated successfully`);
          this.generateNextItem();
        } else if (value === "failed") {
          this.handleGenerationError(asset as any);
        }
      });
    })
    .catch((err) => this.handleGenerationError({ errorMsg: err.toString(), errorCode: -1 }));
  }

  private completeGeneration() {
    const environmentText = this.aiAnalysisData.environment || "space";
    const styleText = this.aiAnalysisData.style || "design";
    this.hintText.text = `${environmentText} ${styleText} generation complete! Tap to regenerate.`;
    this.enableSpinners(false);
    this.isGenerating = false;
    this.availableToRequest = true;
    print("AI-guided 3D generation completed successfully");
  }

  private handleGenerationError(error: { errorMsg: string; errorCode: number }) {
    this.enableSpinners(false);
    this.isGenerating = false;
    this.availableToRequest = true;
    this.hintText.text = `Generation failed: ${error.errorMsg}`;
    print("3D generation error: " + error.errorMsg);
  }

  private regenerateWithCurrentData() {
    if (!this.hasValidAnalysis) {
      print("No valid AI analysis data available for regeneration");
      this.hintText.text = "Please wait for AI analysis to complete...";
      return;
    }

    if (!this.aiAnalysisData.horizontalItemDesc || !this.aiAnalysisData.verticalItemDesc || !this.aiAnalysisData.flooringItemDesc) {
      print("No stored AI item descriptions available for regeneration");
      this.hintText.text = "Missing AI-generated item descriptions";
      return;
    }

    print("Regenerating with stored AI analysis data");
    this.processItemDescriptions(this.aiAnalysisData);
    this.startAutoGeneration();
  }

  private resetAssets() {
    this.imageRoot.enabled = false;
    [this.furnitureSceneObject, this.wallArtSceneObject, this.decorativeSceneObject].forEach(obj => {
      if (obj) {
        obj.destroy();
      }
    });
    this.furnitureSceneObject = this.wallArtSceneObject = this.decorativeSceneObject = null;
  }

  private initializeSpinners() {
    this.loaderSpinnerImage = this.imageRoot.sceneObject.getChild(1);
    this.furnitureSpinner = this.furnitureRoot.getChild(1);
    this.wallArtSpinner = this.wallArtRoot.getChild(1);
    this.decorativeSpinner = this.decorativeRoot.getChild(1);
    this.enableSpinners(false);
  }

  private enableSpinners(enable: boolean) {
    this.loaderSpinnerImage.enabled = enable;
    this.furnitureSpinner.enabled = enable;
    this.wallArtSpinner.enabled = enable;
    this.decorativeSpinner.enabled = enable;
  }

  private delayedCallback(delayTime: number, callback: () => void) {
    const delayedCallbackEvent = this.createEvent("DelayedCallbackEvent");
    delayedCallbackEvent.bind(callback);
    delayedCallbackEvent.reset(delayTime);
  }

  public isReadyForGeneration(): boolean {
    return this.availableToRequest && !this.isGenerating && this.hasValidAnalysis;
  }

  public getGenerationStatus() {
    return {
      isGenerating: this.isGenerating,
      hasValidAnalysis: this.hasValidAnalysis,
      currentStep: this.currentGenerationStep,
      totalSteps: this.totalSteps,
      hasAIData: !!(this.aiAnalysisData.horizontalItemDesc && this.aiAnalysisData.verticalItemDesc && this.aiAnalysisData.flooringItemDesc),
      aiAnalysisData: this.aiAnalysisData
    };
  }

  public getStoredAnalysisData() {
    return {
      ...this.aiAnalysisData,
      currentPrompts: {
        furniture: this.furniturePrompt,
        wallArt: this.wallArtPrompt,
        decorative: this.decorativePrompt
      }
    };
  }

  public resetGeneratorState() {
    this.isGenerating = false;
    this.availableToRequest = false;
    this.hasValidAnalysis = false;
    this.resetAssets();
    this.hintText.text = "Waiting for AI room analysis...";
    
    this.furniturePrompt = this.wallArtPrompt = this.decorativePrompt = "";
    
    this.furnitureItemDesc = this.wallArtItemDesc = this.decorativeItemDesc = "";
    this.roomAnalysis = this.designSuggestions = this.roomLayout = "";
    this.roomType = this.roomStyle = this.roomColors = this.roomEnvironment = "";
    
    this.aiAnalysisData = {
      analysis: "",
      suggestions: "",
      layout: "",
      roomType: "",
      style: "",
      colors: "",
      environment: "",
      horizontalItemDesc: "",
      verticalItemDesc: "",
      flooringItemDesc: ""
    };
    
    print("Generator reset with AI data cleared");
  }

  public updateAIAnalysisDataExternal(data: any) {
    this.updateAIAnalysisData(data);
    this.updateUIFields();
    this.hasValidAnalysis = true;
    print("AI analysis data updated externally");
  }

  public getAIAnalysisData() {
    return this.aiAnalysisData;
  }

  public setEnhancePrompts(enhance: boolean) {
    this.enhancePrompts = enhance;
    print(`Prompt enhancement ${enhance ? 'enabled' : 'disabled'}`);
  }

  public hasValidAIAnalysis(): boolean {
    return this.hasValidAnalysis && !!(this.aiAnalysisData.horizontalItemDesc && this.aiAnalysisData.verticalItemDesc && this.aiAnalysisData.flooringItemDesc);
  }
}