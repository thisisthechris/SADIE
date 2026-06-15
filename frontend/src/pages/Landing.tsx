import { Link } from "react-router-dom";
import Logo from "../components/Logo";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="text-center">
        <div className="flex justify-center mb-12">
          <Logo />
        </div>
        
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          SADIE
        </h1>
        
        <Link
          to="/login"
          className="btn-primary"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}
