import { Auth, User } from "firebase/auth";

declare interface ILoginArgs {
    email: string;
    password: string;
    remember: boolean;
}


declare interface IRegisterProps {
    setReCaptchaContainer: (ref: any) => void;
}

declare interface IRegisterArgs extends ILoginArgs {
    phone?: string;
    displayName?: string;
}

declare interface IUser extends Partial<User> {
    email: string;
    name?: string;
}

declare type TLogoutData = void | false | string;


export { ILoginArgs, IRegisterProps, IRegisterArgs, IUser, TLogoutData };