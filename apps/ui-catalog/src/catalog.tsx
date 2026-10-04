import { useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import {
  ActivityIcon,
  AddIcon,
  AttachmentIcon,
  CalendarIcon,
  CompanyIcon,
  DeleteIcon,
  EditIcon,
  FilterIcon,
  ModelIcon,
  SearchIcon,
  SecurityIcon,
  SettingsIcon,
  UserIcon,
} from '@moonwitness/ui/icons';
import { Avatar } from '@moonwitness/ui/components/avatar';
import { Badge } from '@moonwitness/ui/components/badge';
import { BarChart, LineChart } from '@moonwitness/ui/components/chart';
import { Checkbox } from '@moonwitness/ui/components/checkbox';
import { Button } from '@moonwitness/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@moonwitness/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@moonwitness/ui/components/dropdown-menu';
import { EmptyState } from '@moonwitness/ui/components/empty-state';
import { Field } from '@moonwitness/ui/components/field';
import { Input } from '@moonwitness/ui/components/input';
import { PageHeader } from '@moonwitness/ui/components/page-header';
import { Pagination } from '@moonwitness/ui/components/pagination';
import { Panel } from '@moonwitness/ui/components/panel';
import { SelectField } from '@moonwitness/ui/components/select-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@moonwitness/ui/components/select';
import { Skeleton } from '@moonwitness/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@moonwitness/ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@moonwitness/ui/components/tabs';
import { toast, ToastHost } from '@moonwitness/ui/components/toast';
import { Toolbar } from '@moonwitness/ui/components/toolbar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@moonwitness/ui/components/tooltip';

const sections = [
  { id: 'foundations', label: 'Foundations' },
  { id: 'actions', label: 'Actions & feedback' },
  { id: 'forms', label: 'Forms' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'data-display', label: 'Data display' },
  { id: 'charts', label: 'Charts' },
] as const;

const chartData = [
  { label: 'Base', value: 42 },
  { label: 'CRM', value: 28 },
  { label: 'Inventory', value: 19 },
];

const iconSamples: { Component: ComponentType<SVGProps<SVGSVGElement>>; label: string }[] = [
  { Component: ActivityIcon, label: 'Activity' },
  { Component: AddIcon, label: 'Add' },
  { Component: AttachmentIcon, label: 'Attachment' },
  { Component: CalendarIcon, label: 'Calendar' },
  { Component: CompanyIcon, label: 'Company' },
  { Component: DeleteIcon, label: 'Delete' },
  { Component: EditIcon, label: 'Edit' },
  { Component: FilterIcon, label: 'Filter' },
  { Component: ModelIcon, label: 'Model' },
  { Component: SearchIcon, label: 'Search' },
  { Component: SecurityIcon, label: 'Security' },
  { Component: SettingsIcon, label: 'Settings' },
  { Component: UserIcon, label: 'User' },
];

function Example({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <article className="catalog-example">
      <div className="catalog-example-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="catalog-example-stage">{children}</div>
    </article>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="catalog-section" id={id} aria-labelledby={`${id}-heading`}>
      <header className="catalog-section-heading">
        <p className="catalog-kicker">COMPONENT SET</p>
        <h2 id={`${id}-heading`}>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="catalog-examples">{children}</div>
    </section>
  );
}

export function Catalog() {
  const [dark, setDark] = useState(false);
  const [page, setPage] = useState(2);
  const [checked, setChecked] = useState(true);
  const [query, setQuery] = useState('');

  function toggleTheme() {
    setDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }

  return (
    <TooltipProvider>
      <div className="catalog-shell">
        <a className="skip-link" href="#catalog-main">
          Skip to components
        </a>
        <aside className="catalog-sidebar" aria-label="Catalog navigation">
          <a className="catalog-brand" href="#top" aria-label="MoonWitness UI catalog home">
            <span className="catalog-brand-mark" aria-hidden="true">
              MW
            </span>
            <span>
              <strong>MOONWITNESS</strong>
              <small>UI CATALOG</small>
            </span>
          </a>
          <nav className="catalog-nav" aria-label="Component sections">
            <span className="catalog-nav-label">LIBRARY</span>
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
          </nav>
          <div className="catalog-sidebar-footer">
            <span>Shared tokens · RC.1</span>
            <span>Keyboard friendly</span>
          </div>
        </aside>

        <main id="catalog-main" className="catalog-main">
          <header className="catalog-topbar" id="top">
            <div>
              <span className="catalog-breadcrumb">Design system / UI package</span>
              <span className="catalog-version">v1.0.0-rc.1</span>
            </div>
            <Button variant="outline" size="sm" onClick={toggleTheme} aria-pressed={dark}>
              {dark ? 'Use light theme' : 'Use dark theme'}
            </Button>
          </header>

          <div className="catalog-content">
            <PageHeader
              title={
                <>
                  One system.
                  <br />
                  <span className="catalog-highlight">Every screen.</span>
                </>
              }
              description="A practical catalog of the shared MoonWitness UI package. Explore real components, keyboard behavior, themes, and responsive states."
              actions={<Badge variant="primary">21 public components</Badge>}
            />

            <Panel
              className="catalog-intro-panel"
              title="Built from the package, not a mock"
              description="Every example below renders the public @moonwitness/ui exports used by the Board. The same semantic token source drives both themes."
            >
              <div className="catalog-intro-meta">
                <span>
                  <strong>21</strong> components
                </span>
                <span>
                  <strong>24</strong> typed icons
                </span>
                <span>
                  <strong>AA</strong> contrast checked
                </span>
              </div>
            </Panel>

            <Section
              id="foundations"
              title="Foundations"
              description="Semantic color, type, identity, and surface primitives. Switch themes to inspect both token maps."
            >
              <Example
                title="Semantic colors"
                description="Theme-aware surfaces and status colors keep meaning stable."
              >
                <div className="swatch-grid">
                  {[
                    ['Page', 'var(--mw-background)'],
                    ['Surface', 'var(--mw-surface)'],
                    ['Primary', 'var(--mw-primary)'],
                    ['Destructive', 'var(--mw-destructive)'],
                    ['Success', 'var(--mw-success)'],
                    ['Info', 'var(--mw-info)'],
                  ].map(([label, color]) => (
                    <div className="swatch" key={label}>
                      <span style={{ backgroundColor: color }} />
                      <small>{label}</small>
                    </div>
                  ))}
                </div>
              </Example>
              <Example
                title="Identity & status"
                description="Avatar initials stay accessible; badges retain text labels across themes."
              >
                <div className="catalog-inline">
                  <Avatar name="Moon Witness" />
                  <Avatar name="System Operator" />
                  <Badge>Draft</Badge>
                  <Badge variant="primary">Active</Badge>
                  <Badge variant="destructive">Blocked</Badge>
                </div>
              </Example>
              <Example
                title="Typed product icons"
                description="Package-owned exports are individually importable and tree-shakeable."
              >
                <div className="icon-grid">
                  {iconSamples.map(({ Component, label }) => (
                    <span className="icon-sample" key={label}>
                      <Component aria-hidden="true" /> <small>{label}</small>
                    </span>
                  ))}
                </div>
              </Example>
            </Section>

            <Section
              id="actions"
              title="Actions & feedback"
              description="Show the full action range, disabled states, long labels, and clear feedback."
            >
              <Example
                title="Button variants and sizes"
                description="Native button semantics are preserved at every size."
              >
                <div className="catalog-button-grid">
                  <Button>Primary action</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="destructive">Delete record</Button>
                  <Button variant="ghost">Quiet action</Button>
                  <Button variant="link">Documentation link</Button>
                  <Button size="xs">Extra small</Button>
                  <Button size="lg">Large action</Button>
                  <Button disabled>Disabled</Button>
                  <Button className="catalog-long-button">
                    Save these organization preferences and notify every workspace administrator
                  </Button>
                </div>
              </Example>
              <Example
                title="Tooltip & toast"
                description="Tooltip opens on focus or hover; toast reports the result without moving focus."
              >
                <div className="catalog-inline">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline">
                        <SearchIcon aria-hidden="true" /> Search
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Search all installed models</TooltipContent>
                  </Tooltip>
                  <Button
                    onClick={() =>
                      toast.success('Settings saved', {
                        description: 'Your workspace preferences are up to date.',
                      })
                    }
                  >
                    Show success toast
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      toast.error('Could not save', {
                        description: 'Check the form and try again.',
                      })
                    }
                  >
                    Show error toast
                  </Button>
                </div>
                <ToastHost />
              </Example>
            </Section>

            <Section
              id="forms"
              title="Forms"
              description="Examples include required fields, descriptions, invalid states, controlled input, and native keyboard access."
            >
              <Example
                title="Field, input & validation"
                description="Labels, help text, and errors are connected through accessible descriptions."
              >
                <div className="catalog-form-grid">
                  <Field
                    htmlFor="catalog-name"
                    label="Display name"
                    required
                    description="Shown in activity and audit screens."
                  >
                    <Input placeholder="Ada Lovelace" />
                  </Field>
                  <Field
                    htmlFor="catalog-email"
                    label="Work email"
                    error="Enter a valid work email address."
                  >
                    <Input type="email" defaultValue="not-an-email" />
                  </Field>
                  <Field
                    htmlFor="catalog-search"
                    label="Filter records"
                    description="Type to filter the sample table below."
                  >
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.currentTarget.value)}
                      placeholder="Search partners"
                    />
                  </Field>
                  <Field htmlFor="catalog-role-native" label="Native select">
                    <SelectField id="catalog-role-native" defaultValue="member">
                      <option value="admin">Administrator</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </SelectField>
                  </Field>
                  <Field htmlFor="catalog-role" label="Accessible select">
                    <Select defaultValue="member">
                      <SelectTrigger id="catalog-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrator</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <label className="catalog-check-row" htmlFor="catalog-consent">
                    <Checkbox
                      id="catalog-consent"
                      checked={checked}
                      onChange={(event) => setChecked(event.currentTarget.checked)}
                    />
                    <span>Include archived records</span>
                  </label>
                </div>
              </Example>
            </Section>

            <Section
              id="overlays"
              title="Overlays & composition"
              description="Dialog, dropdown, tabs, toolbars, and page framing support keyboard-first workflows."
            >
              <Example
                title="Dialog & dropdown"
                description="Open with Enter or Space, move with arrow keys, close with Escape."
              >
                <div className="catalog-inline">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button>Open dialog</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Confirm workspace change</DialogTitle>
                        <DialogDescription>
                          This sample dialog traps focus, supports Escape, and returns focus to its
                          trigger.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button onClick={() => toast.success('Workspace updated')}>
                            Confirm change
                          </Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        More actions <span aria-hidden="true">⌄</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>Sample actions</DropdownMenuLabel>
                      <DropdownMenuItem>
                        <EditIcon aria-hidden="true" /> Edit record
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <AddIcon aria-hidden="true" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive">
                        <DeleteIcon aria-hidden="true" /> Delete record
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Example>
              <Example
                title="Tabs, toolbar & page header"
                description="Composed patterns keep related actions and content grouped."
              >
                <Tabs defaultValue="overview" className="catalog-tabs">
                  <TabsList aria-label="Sample content views">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="access">Access</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview">
                    <Toolbar
                      aria-label="Sample list actions"
                      filters={<Input aria-label="Search items" placeholder="Search items" />}
                      actions={<Button size="sm">Add item</Button>}
                    />
                    <p className="catalog-tab-copy">
                      Overview content with a useful empty border and focus state.
                    </p>
                  </TabsContent>
                  <TabsContent value="activity">
                    <p className="catalog-tab-copy">Recent events are grouped by date and actor.</p>
                  </TabsContent>
                  <TabsContent value="access">
                    <p className="catalog-tab-copy">
                      Role assignments and access rules belong here.
                    </p>
                  </TabsContent>
                </Tabs>
              </Example>
            </Section>

            <Section
              id="data-display"
              title="Data display"
              description="Tables, pagination, loading placeholders, and empty states cover common data conditions."
            >
              <Example
                title="Table & pagination"
                description="Native table semantics and bounded, controlled page navigation."
              >
                <Table>
                  <caption className="sr-only">Sample installed addons</caption>
                  <TableHead>
                    <TableRow>
                      <TableHeader scope="col">Addon</TableHeader>
                      <TableHeader scope="col">Owner</TableHeader>
                      <TableHeader scope="col">Status</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[
                      ['Base', 'Platform team', 'Active'],
                      ['CRM', 'Operations', 'Review'],
                      ['Inventory', 'Supply group', 'Active'],
                    ]
                      .filter(([name]) =>
                        name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
                      )
                      .map(([name, owner, status]) => (
                        <TableRow key={name}>
                          <TableCell>{name}</TableCell>
                          <TableCell>{owner}</TableCell>
                          <TableCell>
                            <Badge variant={status === 'Active' ? 'primary' : 'default'}>
                              {status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                <Pagination
                  className="catalog-pagination"
                  page={page}
                  pageCount={5}
                  onPageChange={setPage}
                />
              </Example>
              <Example
                title="Loading & empty states"
                description="Loading state is announced; empty state supplies context and a clear next action."
              >
                <div className="catalog-state-stack">
                  <Skeleton label="Loading a partner record" className="catalog-skeleton" />
                  <EmptyState
                    title="No matching records"
                    description="Change your filters or create a partner to get started."
                    icon={<SearchIcon />}
                    action={
                      <Button size="sm" onClick={() => setQuery('')}>
                        Clear filters
                      </Button>
                    }
                  />
                </div>
              </Example>
            </Section>

            <Section
              id="charts"
              title="Charts"
              description="Data visualizations include loading/error/empty states, locale formatting, and accessible alternatives."
            >
              <Example
                title="Bar & line charts"
                description="Each chart has a labeled table alternative and values formatted with the requested locale."
              >
                <div className="catalog-chart-grid">
                  <BarChart
                    title="Installed addons"
                    data={chartData}
                    locale="en-US"
                    valueLabel="Addons"
                  />
                  <LineChart
                    title="Weekly activity"
                    labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri']}
                    series={[
                      { label: 'Jobs', values: [12, 18, 16, 24, 31] },
                      { label: 'Users', values: [7, 9, 14, 12, 22] },
                    ]}
                    locale="en-US"
                  />
                  <BarChart title="Loading example" data={[]} loading />
                  <BarChart title="Error example" data={[]} error="Activity could not be loaded." />
                  <BarChart title="Empty example" data={[]} emptyMessage="No events yet." />
                </div>
              </Example>
            </Section>

            <footer className="catalog-footer">
              <span>MoonWitness UI · built from public package exports</span>
              <a href="https://github.com/bjo163/moonwitness-xi/tree/dev/packages/ui">
                Browse package source
              </a>
            </footer>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
