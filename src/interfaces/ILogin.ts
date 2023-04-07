import { Auth } from "firebase/auth";

declare interface ILoginArgs {
    email: string;
    password: string;
    remember: boolean;
    tenant?: string;
}


declare interface IRegisterProps {
    setReCaptchaContainer: (ref: any) => void;
}

declare interface IRegisterArgs extends ILoginArgs {
    phone?: string;
    displayName?: string;
}

declare type TLogoutData = void | false | string;


export { ILoginArgs, IRegisterProps, IRegisterArgs, TLogoutData };