import { BookOpen, CalendarCheck, MapPin, Kanban, MoreHorizontal, Settings, Users, LayoutGrid, Megaphone } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { label: "Tasks", to: "/app", icon: CalendarCheck },
  { label: "Contacts", to: "/contacts", icon: Users },
  { label: "Settings", to: "/settings", icon: Settings },
];

const isActiveRoute = (pathname: string, to: string) => {
  if (to === "/app") return pathname === "/app" || pathname === "/";
  return pathname.startsWith(to);
};

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOthersActive = ["/pipeline", "/outreach", "/projects", "/planning", "/eisenhower", "/resources"].some((route) =>
    location.pathname.startsWith(route),
  );

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-1px_6px_rgba(0,0,0,0.06)]">
      <div className="grid grid-cols-4 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium transition-colors",
                isOthersActive ? "text-primary" : "text-muted-foreground",
              )}
              aria-current={isOthersActive ? "page" : undefined}
            >
              <MoreHorizontal
                className={cn("h-5 w-5", isOthersActive ? "text-primary" : "text-muted-foreground")}
              />
              <span className="leading-none">Others</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="min-w-[180px]">
            <DropdownMenuItem onClick={() => navigate("/pipeline")}>
              <Kanban className="h-4 w-4 mr-2" />
              Pipeline
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/outreach")}>
              <Megaphone className="h-4 w-4 mr-2" />
              Outreach Ops
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/projects")}>
              <MapPin className="h-4 w-4 mr-2" />
              Projects
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/eisenhower")}>
              <LayoutGrid className="h-4 w-4 mr-2" />
              Easy Eisenhower
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/resources")}>
              <BookOpen className="h-4 w-4 mr-2" />
              Resources
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
