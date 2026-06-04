"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, CreditCard, ArrowRight } from "lucide-react";

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutContent />
    </Suspense>
  );
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function CheckoutContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const creemCheckoutUrl = process.env.NEXT_PUBLIC_CREEM_CHECKOUT_URL;

  const isValidProjectId = projectId && UUID_REGEX.test(projectId);

  const handlePayment = () => {
    if (!creemCheckoutUrl) return;
    if (!isValidProjectId) return;
    window.location.href = `${creemCheckoutUrl}?metadata[projectId]=${projectId}`;
  };

  if (!isValidProjectId) {
    return (
      <div className="min-h-screen bg-charcoal-dark flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-2">
            <p className="text-destructive font-semibold">Invalid or missing project ID.</p>
            <p className="text-sm text-muted-foreground">Please use a valid checkout link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!creemCheckoutUrl) {
    return (
      <div className="min-h-screen bg-charcoal-dark flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-2">
            <p className="text-destructive font-semibold">Payment is not configured.</p>
            <p className="text-sm text-muted-foreground">Please contact support.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal-dark flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Image
            src="/logo.svg"
            alt="Sicarii"
            width={48}
            height={48}
            className="rounded-lg mx-auto mb-4"
          />
          <CardTitle className="text-2xl">Complete Your Payment</CardTitle>
          <CardDescription>
            Secure payment processed through Creem.io
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Project setup</span>
              <span className="font-medium">Included</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Design & Development</span>
              <span className="font-medium">Included</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Testing & Launch</span>
              <span className="font-medium">Included</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Revision support</span>
              <span className="font-medium">Included</span>
            </div>
            <div className="border-t border-border pt-3 flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-orange text-lg">Contact for quote</span>
            </div>
          </div>

          <Button
            variant="glow"
            size="lg"
            className="w-full"
            onClick={handlePayment}
          >
            <CreditCard className="mr-2 h-5 w-5" />
            Pay with Creem.io
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Secure, encrypted payment</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
