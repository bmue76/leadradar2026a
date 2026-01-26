export type { FieldType, FormStatus } from "@prisma/client";

// canonical types live here
export type { FormDto, FormFieldDto } from "./_components/builder.types";
export { isRecord, isSystemField, getOptionsFromConfig, setOptionsInConfig } from "./_components/builder.types";

// backwards-compatible aliases (older components may import these names)
export type BuilderForm = import("./_components/builder.types").FormDto;
export type BuilderField = import("./_components/builder.types").FormFieldDto;
