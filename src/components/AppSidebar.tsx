import { CalendarCheck, Users, Kanban, Bell, Settings, TreePine, ClipboardList } from 'lucide-react';
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

const navItems = [
  { title: 'Follow-Up Today', url: '/', icon: CalendarCheck },
  { title: 'Contacts', url: '/contacts', icon: Users },
  { title: 'Pipeline', url: '/pipeline', icon: Kanban },
  { title: 'Planning', url: '/planning', icon: ClipboardList },
  { title: 'All Reminders', url: '/reminders', icon: Bell },
];

export function AppSidebar() {
  const { getTasksForToday } = useCRMContext();
  const { isMobile, setOpenMobile } = useSidebar();
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
    <Sidebar className="border-r border-border lg:w-64 xl:w-72">
      <SidebarHeader className="p-4 lg:p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <TreePine className="h-6 w-6 text-primary" />
          <h1 className="text-xl lg:text-2xl font-semibold text-foreground">Figtree</h1>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2 lg:p-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="flex items-center gap-3 px-3 py-2 lg:py-3 rounded-md transition-colors hover:bg-accent"
                      activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                      onClick={() => handleNavClick(item.url)}
                    >
                      <item.icon className="h-5 w-5 lg:h-6 lg:w-6" />
                      <span className="flex-1 lg:text-base">{item.title}</span>
                      {item.url === '/' && todayTasks.length > 0 && (
                        <Badge variant="destructive" className="ml-auto text-xs lg:text-sm">
                          {todayTasks.length}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2 lg:p-3 border-t border-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/settings"
                className="flex items-center gap-3 px-3 py-2 lg:py-3 rounded-md transition-colors hover:bg-accent"
                activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                onClick={() => handleNavClick('/settings')}
              >
                <Settings className="h-5 w-5 lg:h-6 lg:w-6" />
                <span className="lg:text-base">Settings</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
