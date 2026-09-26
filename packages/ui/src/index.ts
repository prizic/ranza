export { AppShell } from "./components/app-shell";
export { AppBottomNav, AppRail, AppSidebar } from "./components/app-rail";
export type { RailLabels, SidebarLabels } from "./components/app-rail";
export { SidebarProvider, useSidebar } from "./components/sidebar-context";
export type { SidebarContextValue } from "./components/sidebar-context";
export { AppPageBar } from "./components/app-page-bar";
export type { PageCrumb } from "./components/app-page-bar";
export { AccountMenu } from "./components/account-menu";
export { LanguageSwitcher } from "./components/language-switcher";
export type { LanguageSwitcherProps } from "./components/language-switcher";
export { SplitAuthLayout } from "./components/split-auth-layout";
export type {
  AuthService,
  SplitAuthLayoutProps,
} from "./components/split-auth-layout";
export {
  groupNavEntries,
  isNavGroup,
  navGroupFor,
  toMobileNav,
} from "./components/nav";
export { SectionTabs } from "./components/section-tabs";
export type { NavEntry, NavGroup, NavLeaf, NavSection } from "./components/nav";
export { DataTable } from "./components/data-table/data-table";
export type {
  DataTableLabels,
  Facet,
} from "./components/data-table/data-table";
export { DataTableColumnHeader } from "./components/data-table/column-header";
export type { ColumnHeaderLabels } from "./components/data-table/column-header";
export { DataTableFacetedFilter } from "./components/data-table/faceted-filter";
export type { FacetOption } from "./components/data-table/faceted-filter";
export { DataTablePagination } from "./components/data-table/pagination";
export type { PaginationLabels } from "./components/data-table/pagination";
export { DataTableRowActions } from "./components/data-table/row-actions";
export type { RowAction } from "./components/data-table/row-actions";
export { DataTableViewOptions } from "./components/data-table/view-options";
export { markOverlayClosed, overlayJustClosed } from "./lib/menu-guard";
export { fieldMatches, toAsciiDigits } from "./lib/search";
export { Combobox, MultiCombobox } from "./components/combobox";
export type {
  ComboboxLabels,
  ComboboxOption,
  ComboboxProps,
  MultiComboboxLabels,
  MultiComboboxProps,
} from "./components/combobox";
export { StatusBadge } from "./components/status-badge";
export type { StatusBadgeProps, StatusTone } from "./components/status-badge";
export { BrandMark } from "./components/brand-mark";
export { DirectionProvider } from "./components/direction-provider";
export { EmptyState } from "./components/empty-state";
export { PlannedScreen } from "./components/planned-screen";
export type { EmptyStateProps } from "./components/empty-state";
export {
  Fact,
  FactList,
  Field,
  FormError,
  PageHeader,
  Stat,
} from "./components/patterns";

export { Badge } from "./components/ui/badge";
export { Button, buttonVariants } from "./components/ui/button";
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
export { Input } from "./components/ui/input";
export { Label } from "./components/ui/label";
export { Separator } from "./components/ui/separator";
export { Textarea } from "./components/ui/textarea";
export { Skeleton } from "./components/ui/skeleton";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table";

export { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
export { Checkbox } from "./components/ui/checkbox";
export {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./components/ui/breadcrumb";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
export { Progress } from "./components/ui/progress";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
export {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./components/ui/sheet";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";

export { cn } from "./lib/utils";
