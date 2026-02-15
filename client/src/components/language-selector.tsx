import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES } from "@/lib/languages";

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  const indianLanguages = LANGUAGES.filter((l) => l.region === "India");
  const otherLanguages = LANGUAGES.filter((l) => l.region !== "India");

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="w-[200px]"
        data-testid="select-language"
      >
        <Globe className="w-4 h-4 mr-2 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Indian Languages</SelectLabel>
          {indianLanguages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code} data-testid={`option-lang-${lang.code}`}>
              {lang.nativeName} ({lang.name})
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Other Languages</SelectLabel>
          {otherLanguages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code} data-testid={`option-lang-${lang.code}`}>
              {lang.nativeName} ({lang.name})
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
