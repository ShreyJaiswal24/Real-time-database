import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
const LoginRoute = ({children}) => { //inspects the token and if user is already logged in then redirect to dashboard
    const token = useAuth().token; //otherwise to the login/register page which is what children is here
    return !token ? children : <Navigate to="/dashboard" />;
};

export default LoginRoute;
