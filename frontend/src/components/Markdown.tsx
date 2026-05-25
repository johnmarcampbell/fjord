import ReactMarkdown from "react-markdown";
import { remarkBreaks } from "../lib/remarkBreaks.js";

const plugins = [remarkBreaks];

export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={plugins}>{children}</ReactMarkdown>;
}
