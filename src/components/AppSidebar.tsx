import { CalendarCheck, Users, Kanban, Settings, ClipboardList, BookOpen, Info, LayoutGrid } from 'lucide-react';
import figtreeLogo from '@/assets/figtree-logo.png';
import { NavLink } from '@/components/NavLink';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { useCRMContext } from '@/contexts/CRMContext';
import { Badge } from '@/components/ui/badge';

const crmItems = [
  { title: 'Follow-Up Today', url: '/app', icon: CalendarCheck },
  { title: 'Contacts', url: '/contacts', icon: Users },
  { title: 'Pipeline', url: '/pipeline', icon: Kanban },
  { title: 'Planning', url: '/planning', icon: ClipboardList },
  { title: 'Resources', url: '/resources', icon: BookOpen },
];

const productivityItems = [
  { title: 'Easy Eisenhower', url: '/eisenhower', icon: LayoutGrid },
];

export function AppSidebar() {
  const { getTasksForToday } = useCRMContext();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const todayTasks = getTasksForToday();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavClick = (url: string) => {
    // Only navigate if not already on this route
    if (location.pathname !== url) {
      navigate(url);
    }
    // Close sidebar on mobile after selecting
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar className="border-r border-border" collapsible="icon">
      <SidebarHeader className={`border-b border-border ${isCollapsed ? 'h-14 p-2 justify-center' : 'h-14 px-4'}`}>
        <div className={`flex items-center h-full ${isCollapsed ? 'justify-center' : 'gap-2'}`}>
          <img src={figtreeLogo} alt="Figtree logo" className="h-6 w-6 flex-shrink-0" />
          {!isCollapsed && (
            <h1 className="text-xl lg:text-2xl font-semibold text-foreground">Figtree</h1>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className={isCollapsed ? 'p-1' : 'p-2 lg:p-3 pt-4 lg:pt-5'}>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {!isCollapsed && (
                <p className="hidden md:block px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground/80">
                  CRM
                </p>
              )}
              {crmItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={isCollapsed ? item.title : undefined}>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className={`flex items-center rounded-md transition-colors hover:bg-accent ${
                        isCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2 lg:py-3'
                      }`}
                      activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                      onClick={() => handleNavClick(item.url)}
                    >
                      <item.icon className="h-5 w-5 lg:h-6 lg:w-6 flex-shrink-0" />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1 lg:text-base">{item.title}</span>
                      {item.url === '/app' && todayTasks.length > 0 && (
                        <Badge variant="destructive" className="ml-auto text-xs lg:text-sm">
                          {todayTasks.length}
                        </Badge>
                      )}
                        </>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className={isCollapsed ? 'mt-auto pt-2' : 'mt-auto pt-4'}>
          <SidebarGroupContent>
            <SidebarMenu>
              {!isCollapsed && (
                <p className="hidden md:block px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground/80">
                  Productivity
                </p>
              )}
              {productivityItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={isCollapsed ? item.title : undefined}>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className={`flex items-center rounded-md transition-colors hover:bg-accent ${
                        isCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2 lg:py-3'
                      }`}
                      activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                      onClick={() => handleNavClick(item.url)}
                    >
                      <item.icon className="h-5 w-5 lg:h-6 lg:w-6 flex-shrink-0" />
                      {!isCollapsed && (
                        <span className="flex-1 lg:text-base">{item.title}</span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className={`border-t border-border ${isCollapsed ? 'p-2 pb-3' : 'p-3 pb-4 lg:p-4 lg:pb-5'}`}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={isCollapsed ? 'Learn more' : undefined}>
                  <NavLink
                    to="/marketing"
                    className={`flex items-center rounded-md transition-colors hover:bg-accent ${
                      isCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2 lg:py-3'
                    }`}
                    activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                    onClick={() => handleNavClick('/marketing')}
                  >
                <Info className="h-5 w-5 lg:h-6 lg:w-6 flex-shrink-0" />
                {!isCollapsed && <span className="lg:text-base">Learn more</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={isCollapsed ? 'Settings' : undefined}>
              <NavLink
                to="/settings"
                className={`flex items-center rounded-md transition-colors hover:bg-accent ${
                  isCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2 lg:py-3'
                }`}
                activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                onClick={() => handleNavClick('/settings')}
              >
                <Settings className="h-5 w-5 lg:h-6 lg:w-6 flex-shrink-0" />
                {!isCollapsed && <span className="lg:text-base">Settings</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
