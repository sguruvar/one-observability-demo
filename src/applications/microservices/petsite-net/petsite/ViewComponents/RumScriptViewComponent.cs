using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using PetSite.Configuration;

namespace PetSite.ViewComponents
{
    public class RumScriptViewComponent : ViewComponent
    {
        private readonly ParameterRefreshManager _refreshManager;

        public RumScriptViewComponent(ParameterRefreshManager refreshManager)
        {
            _refreshManager = refreshManager;
        }

        public async Task<IViewComponentResult> InvokeAsync()
        {
            try
            {
                var rumScript = await ParameterNames.GetParameterValueAsync(
                    ParameterNames.RUM_SCRIPT_PARAMETER,
                    _refreshManager
                );

                if (!string.IsNullOrEmpty(rumScript))
                {
                    return View("Default", rumScript);
                }
            }
            catch
            {
                // RUM script not available - return empty
            }

            return View("Default", (string)null);
        }
    }
}

