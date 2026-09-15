import * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-4 rounded-xl border py-4 shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-1 px-4", className)} {...props} />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("font-semibold leading-none", className)} {...props} />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("text-muted-foreground text-sm", className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-4", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center px-4", className)} {...props} />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
