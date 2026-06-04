"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Star, Send, CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface NPSSurveyProps {
  projectId: string;
  projectName: string;
  onDismiss: () => void;
}

export function NPSSurvey({ projectId, projectName, onDismiss }: NPSSurveyProps) {
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (score === null) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          score,
          feedback: feedback || null,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card className="border-orange/30 bg-orange/5">
        <CardContent className="p-6 text-center">
          <CheckCircle className="h-10 w-10 text-success mx-auto mb-3" />
          <p className="font-semibold">Thank you for your feedback!</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your response helps us improve our service.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-orange/30 bg-orange/5 relative">
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>

      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Star className="h-5 w-5 text-orange" />
          How was your experience?
        </CardTitle>
        <CardDescription>
          Rate your experience with &ldquo;{projectName}&rdquo;
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score selector */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            How likely are you to recommend us? (1-10)
          </p>
          <div className="flex gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setScore(n)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-all cursor-pointer",
                  score === n
                    ? "bg-orange text-white shadow-md"
                    : "border border-border hover:border-orange/50 hover:bg-orange/5"
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
            <span>Not likely</span>
            <span>Very likely</span>
          </div>
        </div>

        {/* Feedback */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">
            Any additional feedback? (optional)
          </label>
          <Textarea
            placeholder="Tell us what we did well or how we can improve..."
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>

        <Button
          variant="glow"
          className="w-full"
          onClick={handleSubmit}
          disabled={score === null || submitting}
        >
          <Send className="mr-1 h-4 w-4" />
          {submitting ? "Submitting..." : "Submit Feedback"}
        </Button>
      </CardContent>
    </Card>
  );
}
