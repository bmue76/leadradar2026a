import LoginForm from "./ui/LoginForm";

type Props = {
  next: string;
  verified: "1" | "0" | null;
};

export default function LoginClient({ next, verified }: Props) {
  return <LoginForm next={next} verified={verified} />;
}
