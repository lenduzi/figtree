import { CalendarCheck, ClipboardList, Kanban, Settings, Users } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";

const navItems = [
  { label: "Tasks", to: "/", icon: CalendarCheck },
  { label: "Contacts", to: "/contacts", icon: Users },
  { label: "Pipeline", to: "/pipeline", icon: Kanban },
  { label: "Plan", to: "/planning", icon: ClipboardList },
  { label: "Settings", to: "/settings", icon: Settings },
];

const isActiveRoute = (pathname: string, to: string) => {
  if (to === "/") return pathname === "/" || pathname.startsWith("/reminders");
  return pathname.startsWith(to);
};

export function MobileBottomNav() {
  const location = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-1px_6px_rgba(0,0,0,0.06)]">
      <div className="grid grid-cols-5 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        {navItems.map((item) => {
          const active = isActiveRoute(location.pathname, item.to);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
              <span className="leading-none">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
