import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** Route: /suppliers/new -> redirects to /suppliers?open=new */
export default function SupplierCreatePage() {
  const nav = useNavigate();
  useEffect(() => {
    nav("/suppliers?open=new", { replace: true });
  }, [nav]);
  return null;
}
