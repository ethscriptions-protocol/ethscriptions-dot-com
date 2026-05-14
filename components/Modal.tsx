import { Button } from "./Button";
import clsx from "clsx";
import { IoClose } from "react-icons/io5";

export const Modal = ({
  show,
  title,
  children,
  confirmText,
  onConfirm,
  onClose,
  loading,
}: {
  show: boolean;
  title: string | string[];
  children: (string | JSX.Element) | (string | JSX.Element)[];
  confirmText?: string;
  onConfirm?: () => void;
  onClose: () => void;
  loading?: boolean;
}) => {
  return (
    <div
      className={clsx(
        "relative z-[1000] transition-opacity duration-500",
        show ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed inset-0 z-10 overflow-y-auto">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose}></div>
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
            <div className="absolute top-4 right-4 cursor-pointer" onClick={onClose}>
              <IoClose size={24} />
            </div>
            <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                  <h3 className="text-base font-semibold leading-6 text-gray-900" id="modal-title">
                    {title}
                  </h3>
                  <div className="mt-2 w-full">{children}</div>
                </div>
              </div>
            </div>
            {!!confirmText && onConfirm && (
              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row sm:px-6 gap-2">
                <Button onClick={onConfirm} loading={loading}>
                  {confirmText}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
