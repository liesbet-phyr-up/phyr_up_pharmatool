import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminDashboard from "@/pages/AdminDashboard";
import CourseWorkspace from "@/pages/CourseWorkspace";
import InviteActivation from "@/pages/InviteActivation";
import LearnerDashboard from "@/pages/LearnerDashboard";
import Login from "@/pages/Login";
import TrainerDashboard from "@/pages/TrainerDashboard";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/login" component={Login} /><Route path="/invite/:token" component={InviteActivation} /><Route path="/learn" component={LearnerDashboard} /><Route path="/course/:id" component={CourseWorkspace} /><Route path="/training" component={TrainerDashboard} /><Route path="/admin" component={AdminDashboard} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
