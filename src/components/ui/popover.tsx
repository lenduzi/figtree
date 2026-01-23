import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";
import { useSheetDrag } from "@/hooks/useSheetDrag";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, children, style, ...props }, ref) => {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const { handleProps, dragOffset, isDragging, isSettling, isMobile } = useSheetDrag({
    onDismiss: () => closeRef.current?.click(),
  });

  const shouldApplyDragStyle = isMobile && (isDragging || isSettling || dragOffset > 0);
  const dragStyle = shouldApplyDragStyle
    ? {
        transform: `translateY(${dragOffset}px)`,
        transition: isDragging ? "none" : "transform 200ms ease-out",
      }
    : undefined;
  const mergedStyle = dragStyle ? { ...style, ...dragStyle } : style;

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "popover-mobile-sheet z-50 w-72 rounded-2xl border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:slide-out-to-bottom-2 sm:rounded-md sm:data-[side=bottom]:slide-in-from-top-2 sm:data-[side=left]:slide-in-from-right-2 sm:data-[side=right]:slide-in-from-left-2 sm:data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        style={mergedStyle}
        {...props}
      >
        <div
          aria-hidden
          className="sm:hidden flex justify-center pb-3 touch-none select-none"
          {...handleProps}
        >
          <span className="mt-1 h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        {children}
        <PopoverPrimitive.Close ref={closeRef} className="sr-only">
          Close
        </PopoverPrimitive.Close>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
