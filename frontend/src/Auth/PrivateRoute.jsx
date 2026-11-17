import React from "react";
import { Navigate} from "react-router-dom";
import { useAuth } from "./AuthProvider";
const PrivateRoute = ({children}) => {
  
  const token = useAuth().token; //prevents an unauthenticated user from manually typing the url to get to dashboard
  return token ? children : <Navigate to="/"/>;
};
export default PrivateRoute;
