import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { LanguageSelector } from "@/components/language-selector";
import { VoiceButton } from "@/components/voice-button";
import { useVoice } from "@/hooks/use-voice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Leaf, Camera, X, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function PlantDoctor() {
  const [language, setLanguage] = useState("en-US");
  const [imageData, setImageData] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const voice = useVoice({ language });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!imageData) throw new Error("No image");
      const res = await fetch("/api/plant-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageData, language }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      return data.analysis as string;
    },
    onSuccess: (result) => {
      setAnalysis(result);
    },
    onError: () => {
      toast({ title: "Analysis failed", description: "Could not analyze the image. Please try again.", variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }

    setFileName(file.name);
    setAnalysis(null);

    const reader = new FileReader();
    reader.onload = () => {
      setImageData(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageData(null);
    setFileName("");
    setAnalysis(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="plant-doctor-page">
      <div className="p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-md bg-chart-2/15 flex items-center justify-center">
            <Leaf className="w-5 h-5 text-chart-2" />
          </div>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-plant-title">Plant Doctor</h1>
            <p className="text-sm text-muted-foreground">
              Upload a photo of your plant to diagnose diseases
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <LanguageSelector value={language} onChange={setLanguage} />
          <VoiceButton
            isListening={voice.isListening}
            isSpeaking={voice.isSpeaking}
            isSupported={voice.isSupported}
            onToggleListening={voice.isListening ? voice.stopListening : voice.startListening}
            onStopSpeaking={voice.stopSpeaking}
          />
          {voice.isListening && (
            <span className="text-sm text-primary animate-pulse">Listening...</span>
          )}
        </div>

        <Card className="mb-6">
          <div className="p-4">
            {!imageData ? (
              <label
                htmlFor="plant-upload"
                className={cn(
                  "flex flex-col items-center justify-center gap-3 py-12 border-2 border-dashed rounded-md cursor-pointer transition-colors",
                  "border-border hover:border-primary/50"
                )}
                data-testid="label-upload"
              >
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                  <Camera className="w-7 h-7 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Upload plant photo</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG or WebP - max 10MB
                  </p>
                </div>
                <Button variant="outline" size="sm" className="mt-2" type="button" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  Choose File
                </Button>
                <input
                  ref={fileInputRef}
                  id="plant-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-file-upload"
                />
              </label>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={imageData}
                    alt="Plant"
                    className="w-full max-h-[400px] object-contain rounded-md bg-muted"
                    data-testid="img-plant-preview"
                  />
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute top-2 right-2"
                    onClick={clearImage}
                    data-testid="button-clear-image"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground truncate">{fileName}</span>
                  <Button
                    onClick={() => analyzeMutation.mutate()}
                    disabled={analyzeMutation.isPending}
                    data-testid="button-analyze"
                  >
                    {analyzeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Leaf className="w-4 h-4 mr-2" />
                    )}
                    {analyzeMutation.isPending ? "Analyzing..." : "Analyze Plant"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {analyzeMutation.isPending && (
          <Card className="mb-6">
            <div className="p-4 space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </Card>
        )}

        {analysis && (
          <Card className="mb-6" data-testid="card-analysis-result">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-chart-2" />
                <h3 className="font-medium text-sm">Analysis Result</h3>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-analysis">
                  {analysis}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => voice.speak(analysis)}
                  data-testid="button-speak-analysis"
                >
                  {voice.isSpeaking ? "Stop" : "Read Aloud"}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
