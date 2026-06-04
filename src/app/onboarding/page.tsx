"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { services, type ServiceType } from "@/lib/services";
import { getTemplatesForService } from "@/lib/project-templates";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";

const steps = [
  { id: "service", title: "Select Service" },
  { id: "business", title: "Business Details" },
  { id: "project", title: "Project Scope" },
  { id: "review", title: "Review & Submit" },
];

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();

  const preselectedService = searchParams.get("service") as ServiceType | null;

  const [currentStep, setCurrentStep] = useState(preselectedService ? 1 : 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    serviceType: preselectedService || ("" as ServiceType | ""),
    businessName: "",
    industry: "",
    website: "",
    description: "",
    targetAudience: "",
    timeline: "",
    budget: "",
    brandColors: "",
    additionalNotes: "",
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.serviceType !== "";
      case 1:
        return formData.businessName.trim() !== "";
      case 2:
        return formData.description.trim() !== "";
      default:
        return true;
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to submit");

      const data = await res.json();
      router.push(`/checkout?projectId=${data.projectId}`);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  const selectedService = services.find((s) => s.id === formData.serviceType);

  return (
    <div className="min-h-screen bg-charcoal-dark">
      {/* Header */}
      <div className="border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Sicarii"
              width={32}
              height={32}
              className="rounded-md"
            />
            <span className="font-bold">Sicarii</span>
          </div>
          <span className="text-sm text-muted-foreground">
            Welcome, {user?.firstName || "there"}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mx-auto max-w-4xl px-4 pt-8">
        <div className="flex items-center justify-between mb-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                    index < currentStep
                      ? "bg-orange text-white"
                      : index === currentStep
                      ? "bg-orange/20 text-orange border-2 border-orange"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {index < currentStep ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className="mt-2 text-xs text-muted-foreground hidden sm:block">
                  {step.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-2 h-0.5 w-8 sm:w-16 lg:w-24 transition-all ${
                    index < currentStep ? "bg-orange" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <Card className="border-border">
          {/* Step 0: Service Selection */}
          {currentStep === 0 && (
            <>
              <CardHeader>
                <CardTitle className="text-2xl">Choose Your Service</CardTitle>
                <CardDescription>
                  What would you like us to build for you?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {services.map((service) => {
                    const Icon = service.icon;
                    const isSelected = formData.serviceType === service.id;
                    return (
                      <button
                        key={service.id}
                        onClick={() => updateField("serviceType", service.id)}
                        className={`flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all cursor-pointer ${
                          isSelected
                            ? "border-orange bg-orange/5 shadow-lg shadow-orange-glow/10"
                            : "border-border hover:border-orange/30"
                        }`}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange/10">
                          <Icon className="h-5 w-5 text-orange" />
                        </div>
                        <div>
                          <p className="font-semibold">{service.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {service.startingPrice}
                          </p>
                        </div>
                        {isSelected && (
                          <Badge variant="orange" className="mt-auto">
                            Selected
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </>
          )}

          {/* Step 1: Business Details */}
          {currentStep === 1 && (
            <>
              <CardHeader>
                <CardTitle className="text-2xl">Business Details</CardTitle>
                <CardDescription>
                  Tell us about your business so we can tailor the build.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Template picker */}
                {formData.serviceType && (
                  (() => {
                    const templates = getTemplatesForService(formData.serviceType as ServiceType);
                    if (templates.length === 0) return null;
                    return (
                      <div className="rounded-xl border border-orange/20 bg-orange/5 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Sparkles className="h-4 w-4 text-orange" />
                          Quick Start Templates
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {templates.map((template) => (
                            <button
                              key={template.name}
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  industry: template.suggestedFields.industry,
                                  description: template.suggestedFields.description,
                                  targetAudience: template.suggestedFields.targetAudience,
                                  timeline: template.suggestedFields.timeline,
                                  budget: template.suggestedFields.budget,
                                }));
                              }}
                              className="text-left rounded-lg border border-border p-3 hover:border-orange/50 hover:bg-orange/5 transition-all cursor-pointer"
                            >
                              <p className="text-sm font-medium">{template.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}

                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Business Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="Acme Inc."
                    value={formData.businessName}
                    onChange={(e) => updateField("businessName", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Industry</label>
                  <Input
                    placeholder="e.g. Technology, Healthcare, Retail"
                    value={formData.industry}
                    onChange={(e) => updateField("industry", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Existing Website (if any)
                  </label>
                  <Input
                    placeholder="https://example.com"
                    value={formData.website}
                    onChange={(e) => updateField("website", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Brand Colors (optional)
                  </label>
                  <Input
                    placeholder="e.g. Blue and white, #3B82F6"
                    value={formData.brandColors}
                    onChange={(e) => updateField("brandColors", e.target.value)}
                  />
                </div>
              </CardContent>
            </>
          )}

          {/* Step 2: Project Scope */}
          {currentStep === 2 && (
            <>
              <CardHeader>
                <CardTitle className="text-2xl">Project Scope</CardTitle>
                <CardDescription>
                  Help us understand what you&apos;re looking for.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Project Description <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    placeholder="Describe what you want built, key features, and any specific requirements..."
                    rows={4}
                    value={formData.description}
                    onChange={(e) => updateField("description", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Target Audience
                  </label>
                  <Input
                    placeholder="Who is this for? e.g. Small business owners, Gen Z consumers"
                    value={formData.targetAudience}
                    onChange={(e) =>
                      updateField("targetAudience", e.target.value)
                    }
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Timeline
                    </label>
                    <Input
                      placeholder="e.g. 2-4 weeks, ASAP"
                      value={formData.timeline}
                      onChange={(e) => updateField("timeline", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Budget Range
                    </label>
                    <Input
                      placeholder="e.g. $2,000 - $5,000"
                      value={formData.budget}
                      onChange={(e) => updateField("budget", e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Additional Notes
                  </label>
                  <Textarea
                    placeholder="Anything else we should know?"
                    rows={3}
                    value={formData.additionalNotes}
                    onChange={(e) =>
                      updateField("additionalNotes", e.target.value)
                    }
                  />
                </div>
              </CardContent>
            </>
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && (
            <>
              <CardHeader>
                <CardTitle className="text-2xl">Review & Submit</CardTitle>
                <CardDescription>
                  Double-check your details before submitting.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Service */}
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground mb-1">Service</p>
                  <div className="flex items-center gap-2">
                    {selectedService && (
                      <>
                        <selectedService.icon className="h-5 w-5 text-orange" />
                        <span className="font-semibold">{selectedService.name}</span>
                        <Badge variant="orange" className="ml-auto">
                          {selectedService.startingPrice}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>

                {/* Business */}
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <p className="text-xs text-muted-foreground mb-1">Business</p>
                  <p className="font-semibold">{formData.businessName}</p>
                  {formData.industry && (
                    <p className="text-sm text-muted-foreground">
                      Industry: {formData.industry}
                    </p>
                  )}
                  {formData.website && (
                    <p className="text-sm text-muted-foreground">
                      Website: {formData.website}
                    </p>
                  )}
                </div>

                {/* Project */}
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <p className="text-xs text-muted-foreground mb-1">Project</p>
                  <p className="text-sm">{formData.description}</p>
                  {formData.timeline && (
                    <p className="text-sm text-muted-foreground">
                      Timeline: {formData.timeline}
                    </p>
                  )}
                  {formData.budget && (
                    <p className="text-sm text-muted-foreground">
                      Budget: {formData.budget}
                    </p>
                  )}
                </div>
              </CardContent>
            </>
          )}

          {/* Navigation buttons */}
          <div className="flex flex-col gap-3 p-6 pt-0">
            {submitError && (
              <p className="text-sm text-destructive text-center">{submitError}</p>
            )}
            <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setCurrentStep((s) => s - 1)}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button
                onClick={() => setCurrentStep((s) => s + 1)}
                disabled={!canProceed()}
              >
                Next
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="glow"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Submit & Continue to Payment
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
